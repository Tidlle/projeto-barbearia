import "server-only";
import { db } from "./db";
import { firstName } from "./format";
import { sendConfirmationWhatsApp } from "./messaging";
import { dateKeyInTz, formatWhen, timeInTz } from "./time";
import { appUrl } from "./whatsapp";

/** "hoje às 15:00" ou "sexta-feira, 13/11 às 15:00" */
export function whenLabel(startsAt: Date, tz: string, now = new Date()) {
  return dateKeyInTz(startsAt, tz) === dateKeyInTz(now, tz) ? `hoje às ${timeInTz(startsAt, tz)}` : formatWhen(startsAt, tz);
}

export function confirmationUrl(publicToken: string) {
  return appUrl(`/confirmar/${publicToken}`);
}

/** Texto da mensagem (o mesmo usado no envio manual pelo WhatsApp do dono). */
export function confirmationMessage(p: { customerName: string; shopName: string; when: string; service: string; professional: string; url: string }) {
  return `Fala, ${firstName(p.customerName)}! Seu horário na ${p.shopName} é ${p.when} (${p.service} com ${p.professional}). Você confirma presença? Toque no link para confirmar ou avisar se não puder vir: ${p.url}`;
}

/**
 * Envia o pedido de confirmação de um agendamento.
 * Sem `force`, só envia uma vez (marca reminderSentAt de forma atômica antes de enviar).
 */
export async function sendConfirmationRequest(appointmentId: string, opts: { force?: boolean; by?: string } = {}) {
  const now = new Date();
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { customer: true, service: true, professional: true, barbershop: true },
  });
  if (!appt) return { ok: false, error: "Agendamento não encontrado" } as const;
  if (appt.status !== "CONFIRMED" || appt.startsAt <= now) return { ok: false, error: "Agendamento não está ativo" } as const;

  if (opts.force) {
    await db.appointment.update({ where: { id: appt.id }, data: { reminderSentAt: now } });
  } else {
    const claim = await db.appointment.updateMany({ where: { id: appt.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claim.count === 0) return { ok: false, error: "Pedido já enviado" } as const;
  }

  const shop = appt.barbershop;
  const when = whenLabel(appt.startsAt, shop.timezone, now);
  const url = confirmationUrl(appt.publicToken);
  const body = confirmationMessage({
    customerName: appt.customer.name,
    shopName: shop.name,
    when,
    service: appt.service.name,
    professional: appt.professional.name,
    url,
  });

  const result = await sendConfirmationWhatsApp({
    to: appt.customer.phone,
    firstName: firstName(appt.customer.name),
    when,
    service: `${appt.service.name} com ${appt.professional.name}`,
    token: appt.publicToken,
  });

  await db.$transaction([
    db.messageLog.create({
      data: {
        barbershopId: shop.id,
        customerId: appt.customerId,
        appointmentId: appt.id,
        kind: "CONFIRMATION_REQUEST",
        provider: result.provider,
        to: appt.customer.phone,
        body,
        status: result.ok ? "SENT" : "FAILED",
        error: result.error,
        externalId: result.externalId,
      },
    }),
    db.interaction.create({
      data: {
        barbershopId: shop.id,
        customerId: appt.customerId,
        type: "WHATSAPP",
        content: result.ok
          ? `Pedido de confirmação enviado (${when})${result.provider === "SIMULADO" ? " — modo simulado" : ""}`
          : `⚠️ Falha ao enviar pedido de confirmação: ${result.error}`,
        createdBy: opts.by,
      },
    }),
  ]);
  return { ok: result.ok, error: result.error, provider: result.provider } as const;
}

/**
 * Rotina (roda a cada minuto): envia o pedido de confirmação para os horários que
 * começam dentro da antecedência configurada (padrão 2h). Agendamentos feitos já
 * dentro dessa janela não recebem pedido — o cliente acabou de marcar.
 */
export async function runConfirmationJob(now = new Date()) {
  const shops = await db.barbershop.findMany({
    where: { confirmationEnabled: true },
    select: { id: true, confirmationLeadMinutes: true },
  });
  let sent = 0;
  let failed = 0;
  let checked = 0;
  for (const shop of shops) {
    const leadMs = shop.confirmationLeadMinutes * 60_000;
    const due = await db.appointment.findMany({
      where: {
        barbershopId: shop.id,
        status: "CONFIRMED",
        reminderSentAt: null,
        attendanceConfirmedAt: null,
        startsAt: { gt: now, lte: new Date(now.getTime() + leadMs) },
      },
      select: { id: true, startsAt: true, createdAt: true },
    });
    for (const a of due) {
      checked++;
      if (a.createdAt.getTime() > a.startsAt.getTime() - leadMs) continue;
      const r = await sendConfirmationRequest(a.id);
      if (r.ok) sent++;
      else if (r.error !== "Pedido já enviado") failed++;
    }
  }
  return { checked, sent, failed };
}

/** Situação da confirmação de presença, para exibir no painel. */
export function attendanceState(
  a: { status: string; startsAt: Date; createdAt: Date; reminderSentAt: Date | null; attendanceConfirmedAt: Date | null },
  shop: { confirmationLeadMinutes: number; confirmationEnabled: boolean; timezone: string },
) {
  if (a.attendanceConfirmedAt) return { tone: "green", label: "Presença confirmada" } as const;
  if (a.status !== "CONFIRMED") return null;
  if (a.startsAt <= new Date()) return null;
  if (a.reminderSentAt) return { tone: "amber", label: "Aguardando resposta" } as const;
  if (!shop.confirmationEnabled) return { tone: "stone", label: "Sem confirmação" } as const;
  const at = new Date(a.startsAt.getTime() - shop.confirmationLeadMinutes * 60_000);
  if (a.createdAt > at) return { tone: "stone", label: "Marcou em cima da hora (sem pedido automático)" } as const;
  return { tone: "stone", label: `Pedido de confirmação às ${timeInTz(at, shop.timezone)}` } as const;
}
