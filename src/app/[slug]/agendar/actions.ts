"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { hasConflict, resolveSlot } from "@/lib/availability";
import { db } from "@/lib/db";
import { computeDueOnline, normalizePhone } from "@/lib/format";
import { createCheckout, mockPaymentsAllowed, paymentProvider } from "@/lib/payments";
import { getShopBySlug } from "@/lib/shop";
import { formatWhen, isValidDateKey } from "@/lib/time";

const VALID_SOURCES = new Set(["site", "instagram", "google", "indicacao", "whatsapp"]);
const cleanSource = (s?: string | null) => (s && VALID_SOURCES.has(s) ? s : "site");

const contactSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(80),
  phone: z.string().trim().min(8, "Informe seu WhatsApp"),
  email: z.union([z.literal(""), z.email("E-mail inválido")]).optional(),
  birthday: z.string().optional(),
  consent: z.boolean().optional(),
});

function parseBirthday(v?: string) {
  return v && isValidDateKey(v) ? new Date(`${v}T00:00:00Z`) : undefined;
}

type ContactInput = z.infer<typeof contactSchema>;

/**
 * Captura o lead assim que o cliente informa os dados de contato — mesmo que ele
 * desista antes de pagar, o dono vê no CRM quem tentou agendar e o quê.
 */
export async function captureLead(input: {
  slug: string;
  contact: ContactInput;
  serviceId: string;
  startsAt?: string;
  source?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = contactSchema.safeParse(input.contact);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "WhatsApp inválido. Use DDD + número." };

  const shop = await getShopBySlug(input.slug);
  if (!shop) return { ok: false, error: "Barbearia não encontrada" };
  const service = await db.service.findFirst({ where: { id: input.serviceId, barbershopId: shop.id } });

  const existing = await db.customer.findUnique({ where: { barbershopId_phone: { barbershopId: shop.id, phone } } });
  const customer = existing
    ? await db.customer.update({
        where: { id: existing.id },
        // para clientes existentes só preenchemos o que estiver em branco
        data: {
          email: existing.email ?? (parsed.data.email || null),
          birthday: existing.birthday ?? parseBirthday(parsed.data.birthday),
          marketingConsent: existing.marketingConsent || !!parsed.data.consent,
        },
      })
    : await db.customer.create({
        data: {
          barbershopId: shop.id,
          name: parsed.data.name,
          phone,
          email: parsed.data.email || null,
          birthday: parseBirthday(parsed.data.birthday),
          marketingConsent: !!parsed.data.consent,
          source: cleanSource(input.source),
          leadStatus: "NEW",
        },
      });

  // evita poluir a linha do tempo se o cliente voltar e avançar várias vezes
  const recent = await db.interaction.findFirst({
    where: { customerId: customer.id, type: "BOOKING_STARTED", createdAt: { gt: new Date(Date.now() - 30 * 60_000) } },
  });
  if (!recent) {
    const when = input.startsAt ? formatWhen(new Date(input.startsAt), shop.timezone) : null;
    await db.interaction.create({
      data: {
        barbershopId: shop.id,
        customerId: customer.id,
        type: "BOOKING_STARTED",
        content: `Começou a agendar "${service?.name ?? "serviço"}"${when ? ` para ${when}` : ""} pelo site`,
      },
    });
  }
  return { ok: true };
}

class SlotTakenError extends Error {}

export type BookingResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; code?: "SLOT_TAKEN" | "INVALID" | "PAYMENT" };

export async function createBooking(input: {
  slug: string;
  serviceId: string;
  professionalId: string | null;
  startsAt: string;
  contact: ContactInput;
  source?: string;
}): Promise<BookingResult> {
  const parsed = contactSchema.safeParse(input.contact);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, code: "INVALID" };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "WhatsApp inválido. Use DDD + número.", code: "INVALID" };

  const shop = await getShopBySlug(input.slug);
  if (!shop) return { ok: false, error: "Barbearia não encontrada", code: "INVALID" };
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: "Horário inválido", code: "INVALID" };

  const service = await db.service.findFirst({ where: { id: input.serviceId, barbershopId: shop.id, active: true } });
  if (!service) return { ok: false, error: "Serviço indisponível", code: "INVALID" };

  const slot = await resolveSlot({ shop, serviceId: service.id, professionalId: input.professionalId, startsAt });
  if (!slot) return { ok: false, error: "Esse horário acabou de ser ocupado. Escolha outro, por favor.", code: "SLOT_TAKEN" };

  const due = computeDueOnline(service.priceCents, shop.paymentMode, shop.depositPercent);
  const needsPayment = due > 0;
  const provider = paymentProvider();
  if (needsPayment && provider === "MOCK" && !mockPaymentsAllowed()) {
    return { ok: false, error: "Pagamento online indisponível no momento. Fale com a barbearia pelo WhatsApp.", code: "PAYMENT" };
  }

  let appointment;
  try {
    appointment = await db.$transaction(
      async (tx) => {
        if (await hasConflict(tx, slot.professionalId, startsAt, slot.endsAt)) throw new SlotTakenError();

        const existing = await tx.customer.findUnique({ where: { barbershopId_phone: { barbershopId: shop.id, phone } } });
        const customer = existing
          ? await tx.customer.update({
              where: { id: existing.id },
              data: {
                email: existing.email ?? (parsed.data.email || null),
                birthday: existing.birthday ?? parseBirthday(parsed.data.birthday),
                marketingConsent: existing.marketingConsent || !!parsed.data.consent,
                ...(needsPayment ? {} : { leadStatus: "CONVERTED" }),
              },
            })
          : await tx.customer.create({
              data: {
                barbershopId: shop.id,
                name: parsed.data.name,
                phone,
                email: parsed.data.email || null,
                birthday: parseBirthday(parsed.data.birthday),
                marketingConsent: !!parsed.data.consent,
                source: cleanSource(input.source),
                leadStatus: needsPayment ? "NEW" : "CONVERTED",
              },
            });

        const created = await tx.appointment.create({
          data: {
            barbershopId: shop.id,
            customerId: customer.id,
            professionalId: slot.professionalId,
            serviceId: service.id,
            startsAt,
            endsAt: slot.endsAt,
            status: needsPayment ? "PENDING_PAYMENT" : "CONFIRMED",
            holdExpiresAt: needsPayment ? new Date(Date.now() + shop.holdMinutes * 60_000) : null,
            priceCents: service.priceCents,
            dueOnlineCents: due,
            source: "ONLINE",
            ...(needsPayment
              ? { payments: { create: { provider, kind: shop.paymentMode === "FULL" ? "FULL" : "DEPOSIT", amountCents: due } } }
              : {}),
          },
          include: { payments: true, professional: true },
        });

        await tx.interaction.create({
          data: {
            barbershopId: shop.id,
            customerId: customer.id,
            type: "BOOKING_CREATED",
            content: `Agendou "${service.name}" com ${created.professional.name} para ${formatWhen(startsAt, shop.timezone)}${
              needsPayment ? " (aguardando pagamento)" : ""
            }`,
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    const serializationFailure = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
    if (e instanceof SlotTakenError || serializationFailure) {
      return { ok: false, error: "Esse horário acabou de ser ocupado. Escolha outro, por favor.", code: "SLOT_TAKEN" };
    }
    throw e;
  }

  const confirmationUrl = `/${shop.slug}/agendamento/${appointment.publicToken}`;
  if (!needsPayment) return { ok: true, redirectTo: confirmationUrl };

  try {
    const url = await createCheckout(appointment.payments[0].id);
    return { ok: true, redirectTo: url };
  } catch (e) {
    console.error("[checkout] falha ao criar cobrança", e);
    // libera o horário e manda para a página do agendamento, onde dá para tentar de novo
    await db.appointment.update({ where: { id: appointment.id }, data: { status: "EXPIRED", holdExpiresAt: null } });
    return { ok: false, error: "Não conseguimos abrir o pagamento agora. Tente novamente em instantes.", code: "PAYMENT" };
  }
}
