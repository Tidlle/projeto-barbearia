import "server-only";
import crypto from "node:crypto";
import { hasConflict } from "./availability";
import { db } from "./db";
import { appUrl } from "./whatsapp";

/**
 * Pagamentos: Mercado Pago (Checkout Pro — Pix e cartão) quando há token,
 * ou um provedor SIMULADO para desenvolvimento.
 */

export function paymentProvider(): "MERCADOPAGO" | "MOCK" {
  return process.env.MERCADOPAGO_ACCESS_TOKEN ? "MERCADOPAGO" : "MOCK";
}

export function mockPaymentsAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_PAYMENTS === "true";
}

const MP_API = "https://api.mercadopago.com";

async function mpFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mercado Pago ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Cria a cobrança e devolve a URL para onde o cliente deve ir pagar. */
export async function createCheckout(paymentId: string): Promise<string> {
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { appointment: { include: { service: true, customer: true, barbershop: true } } },
  });
  const { appointment } = payment;
  const shop = appointment.barbershop;
  const returnUrl = appUrl(`/${shop.slug}/agendamento/${appointment.publicToken}`);

  if (payment.provider === "MOCK") {
    const url = `/pagamento/simulado/${payment.id}`;
    await db.payment.update({ where: { id: payment.id }, data: { checkoutUrl: url } });
    return url;
  }

  const isHttps = returnUrl.startsWith("https://");
  const title = `${payment.kind === "DEPOSIT" ? "Sinal — " : ""}${appointment.service.name} · ${shop.name}`;
  const preference = await mpFetch("/checkout/preferences", {
    method: "POST",
    headers: { "X-Idempotency-Key": payment.id },
    body: JSON.stringify({
      items: [{ id: appointment.serviceId, title, quantity: 1, currency_id: "BRL", unit_price: payment.amountCents / 100 }],
      payer: { name: appointment.customer.name, ...(appointment.customer.email ? { email: appointment.customer.email } : {}) },
      external_reference: payment.id,
      back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
      ...(isHttps ? { auto_return: "approved", notification_url: appUrl("/api/webhooks/mercadopago") } : {}),
      statement_descriptor: shop.name.slice(0, 22),
      ...(appointment.holdExpiresAt
        ? { expires: true, expiration_date_to: appointment.holdExpiresAt.toISOString() }
        : {}),
    }),
  });
  const url: string = preference.init_point;
  await db.payment.update({ where: { id: payment.id }, data: { checkoutUrl: url, externalId: preference.id } });
  return url;
}

const MP_STATUS: Record<string, string> = {
  approved: "APPROVED",
  authorized: "PENDING",
  pending: "PENDING",
  in_process: "PENDING",
  in_mediation: "PENDING",
  rejected: "REJECTED",
  cancelled: "CANCELLED",
  refunded: "REFUNDED",
  charged_back: "REFUNDED",
};

/** Busca o pagamento no Mercado Pago e aplica o status no nosso banco. */
export async function syncMercadoPagoPayment(mpPaymentId: string) {
  if (paymentProvider() !== "MERCADOPAGO") return null;
  const mp = await mpFetch(`/v1/payments/${encodeURIComponent(mpPaymentId)}`);
  const ourId: string | undefined = mp.external_reference;
  if (!ourId) return null;
  return applyPaymentStatus(ourId, MP_STATUS[mp.status] ?? "PENDING", String(mp.id));
}

/** Ponto único que muda status de pagamento e reflete no agendamento/CRM. Idempotente. */
export async function applyPaymentStatus(paymentId: string, status: string, externalId?: string) {
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { appointment: true } });
    if (!payment) return null;
    if (payment.status === status) return payment;
    if (payment.status === "APPROVED" && status !== "REFUNDED") return payment; // não regride

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status,
        ...(externalId ? { externalId } : {}),
        ...(status === "APPROVED" ? { paidAt: new Date() } : {}),
      },
    });
    const appt = payment.appointment;

    if (status === "APPROVED") {
      // Pagamento que chegou depois da reserva expirar: só confirma se o horário ainda estiver livre.
      const wasWaiting = appt.status === "PENDING_PAYMENT" || appt.status === "EXPIRED";
      const lateConflict =
        wasWaiting &&
        (appt.status === "EXPIRED" || (appt.holdExpiresAt && appt.holdExpiresAt < new Date())) &&
        (await hasConflict(tx, appt.professionalId, appt.startsAt, appt.endsAt, appt.id));
      await tx.appointment.update({
        where: { id: appt.id },
        data: {
          paidCents: { increment: payment.amountCents },
          ...(wasWaiting ? { status: lateConflict ? "EXPIRED" : "CONFIRMED", holdExpiresAt: null } : {}),
        },
      });
      if (lateConflict) {
        await tx.interaction.create({
          data: {
            barbershopId: appt.barbershopId,
            customerId: appt.customerId,
            type: "PAYMENT",
            content: "⚠️ Pagamento recebido depois que a reserva expirou e o horário já foi ocupado. Remarque ou estorne.",
          },
        });
      }
      await tx.customer.update({ where: { id: appt.customerId }, data: { leadStatus: "CONVERTED" } });
      await tx.interaction.create({
        data: {
          barbershopId: appt.barbershopId,
          customerId: appt.customerId,
          type: "PAYMENT",
          content: `Pagamento aprovado (${payment.kind === "DEPOSIT" ? "sinal" : "total"}): R$ ${(payment.amountCents / 100).toFixed(2).replace(".", ",")}`,
        },
      });
    } else if (status === "REFUNDED" && payment.status === "APPROVED") {
      await tx.appointment.update({
        where: { id: appt.id },
        data: { paidCents: { decrement: payment.amountCents } },
      });
      await tx.interaction.create({
        data: { barbershopId: appt.barbershopId, customerId: appt.customerId, type: "PAYMENT", content: "Pagamento estornado" },
      });
    } else if (status === "REJECTED") {
      await tx.interaction.create({
        data: { barbershopId: appt.barbershopId, customerId: appt.customerId, type: "PAYMENT", content: "Pagamento recusado" },
      });
    }
    return updated;
  });
}

/** Valida a assinatura x-signature dos webhooks do Mercado Pago. */
export function verifyMercadoPagoSignature(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true; // sem segredo configurado: confiamos na consulta à API (feita depois)
  if (!params.xSignature) return false;
  const fields = Object.fromEntries(
    params.xSignature.split(",").map((kv) => kv.split("=").map((s) => s.trim()) as [string, string]),
  );
  const { ts, v1 } = fields;
  if (!ts || !v1) return false;
  let manifest = "";
  if (params.dataId) manifest += `id:${params.dataId.toLowerCase()};`;
  if (params.xRequestId) manifest += `request-id:${params.xRequestId};`;
  manifest += `ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return expected.length === v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
