import "server-only";
import type { Appointment, Barbershop, Customer, Professional, Service } from "@prisma/client";
import { db } from "./db";
import { firstName } from "./format";
import { sendConfirmationWhatsApp, whatsappProvider } from "./messaging";
import { addDaysToKey, dateKeyInTz, formatWhen, minutesOf, timeInTz, zonedToUtc } from "./time";
import { appUrl, waLink } from "./whatsapp";

/**
 * Esteira de confirmação de presença.
 *
 * Cada horário agendado entra na FILA no momento certo (padrão: 2h antes; ou em rodadas de
 * 30/60 min, se configurado). Daí:
 *  - modo ASSISTIDO (padrão): a equipe envia pelo WhatsApp da barbearia, um toque por cliente;
 *  - modo automático (API oficial configurada): a rotina envia sozinha; se falhar, o item
 *    continua na fila para envio manual.
 * A resposta do cliente vem pelo link da mensagem e cai sozinha na agenda.
 */

type ShopCfg = Pick<
  Barbershop,
  "id" | "name" | "timezone" | "confirmationEnabled" | "confirmationLeadMinutes" | "confirmationBatchMinutes"
>;
type ApptFull = Appointment & { customer: Customer; service: Service; professional: Professional };

/** "hoje às 15:00" ou "sexta-feira, 13/11 às 15:00" */
export function whenLabel(startsAt: Date, tz: string, now = new Date()) {
  return dateKeyInTz(startsAt, tz) === dateKeyInTz(now, tz) ? `hoje às ${timeInTz(startsAt, tz)}` : formatWhen(startsAt, tz);
}

export function confirmationUrl(publicToken: string) {
  return appUrl(`/confirmar/${publicToken}`);
}

/** Texto da mensagem enviada ao cliente. */
export function confirmationMessage(p: { customerName: string; shopName: string; when: string; service: string; professional: string; url: string }) {
  return `Fala, ${firstName(p.customerName)}! Seu horário na ${p.shopName} é ${p.when} (${p.service} com ${p.professional}). Você confirma presença? Toque no link para confirmar ou avisar se não puder vir: ${p.url}`;
}

export function messageFor(a: ApptFull, shop: Pick<Barbershop, "name" | "timezone">, now = new Date()) {
  return confirmationMessage({
    customerName: a.customer.name,
    shopName: shop.name,
    when: whenLabel(a.startsAt, shop.timezone, now),
    service: a.service.name,
    professional: a.professional.name,
    url: confirmationUrl(a.publicToken),
  });
}

/** Quando o pedido "vence" (2h antes) e quando entra na fila (igual, ou no início da rodada). */
export function confirmationTiming(startsAt: Date, shop: ShopCfg) {
  const dueAt = new Date(startsAt.getTime() - shop.confirmationLeadMinutes * 60_000);
  const batch = shop.confirmationBatchMinutes;
  if (!batch) return { dueAt, releaseAt: dueAt };
  const offset = minutesOf(timeInTz(dueAt, shop.timezone)) % batch;
  return { dueAt, releaseAt: new Date(dueAt.getTime() - offset * 60_000) };
}

export type QueueItem = {
  appointment: ApptFull;
  dueAt: Date;
  releaseAt: Date;
  late: boolean;
  message: string;
  waUrl: string;
};

/**
 * Monta a esteira do dia:
 *  - ready: na fila, aguardando envio (o contador do menu);
 *  - upcoming: ainda vão entrar na fila hoje;
 *  - lastMinute: marcaram já dentro da janela (envio opcional);
 *  - sent: pedidos enviados hoje, com a resposta do cliente.
 */
export async function getConfirmationQueue(shop: ShopCfg, now = new Date()) {
  const empty = { ready: [] as QueueItem[], upcoming: [] as QueueItem[], lastMinute: [] as QueueItem[], sent: [] as ApptFull[] };
  if (!shop.confirmationEnabled) return empty;

  const todayKey = dateKeyInTz(now, shop.timezone);
  const dayStart = zonedToUtc(todayKey, "00:00", shop.timezone);
  const dayEnd = zonedToUtc(addDaysToKey(todayKey, 1), "00:00", shop.timezone);
  const horizon = new Date(now.getTime() + (shop.confirmationLeadMinutes + shop.confirmationBatchMinutes) * 60_000);

  const appts = await db.appointment.findMany({
    where: {
      barbershopId: shop.id,
      startsAt: { gte: dayStart, lt: horizon > dayEnd ? horizon : dayEnd },
      status: { in: ["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"] },
    },
    include: { customer: true, service: true, professional: true },
    orderBy: { startsAt: "asc" },
  });

  const out = { ...empty, ready: [] as QueueItem[] };
  for (const a of appts) {
    if (a.reminderSentAt) {
      if (a.reminderSentAt >= dayStart) out.sent.push(a);
      continue;
    }
    if (a.status !== "CONFIRMED" || a.startsAt <= now || a.attendanceConfirmedAt || a.confirmationSkippedAt) continue;
    const { dueAt, releaseAt } = confirmationTiming(a.startsAt, shop);
    const item: QueueItem = {
      appointment: a,
      dueAt,
      releaseAt,
      late: now.getTime() > dueAt.getTime() + 30 * 60_000,
      message: messageFor(a, shop, now),
      waUrl: "",
    };
    item.waUrl = waLink(a.customer.phone, item.message);
    if (a.createdAt > dueAt) out.lastMinute.push(item);
    else if (releaseAt <= now) out.ready.push(item);
    else if (a.startsAt < dayEnd) out.upcoming.push(item);
  }
  out.sent.sort((x, y) => (y.reminderSentAt!.getTime() - x.reminderSentAt!.getTime()));
  return out;
}

/** Só a contagem da fila (para o contador do menu). */
export async function countReadyConfirmations(shop: ShopCfg) {
  return (await getConfirmationQueue(shop)).ready.length;
}

/** Equipe enviou pelo WhatsApp da barbearia. Idempotente. */
export async function markConfirmationSent(appointmentId: string, barbershopId: string, by?: string) {
  const appt = await db.appointment.findFirst({
    where: { id: appointmentId, barbershopId },
    include: { customer: true, service: true, professional: true, barbershop: true },
  });
  if (!appt) throw new Error("Agendamento não encontrado");
  const claim = await db.appointment.updateMany({ where: { id: appt.id, reminderSentAt: null }, data: { reminderSentAt: new Date() } });
  if (claim.count === 0) return;
  await db.$transaction([
    db.messageLog.create({
      data: {
        barbershopId,
        customerId: appt.customerId,
        appointmentId: appt.id,
        kind: "CONFIRMATION_REQUEST",
        provider: "MANUAL",
        to: appt.customer.phone,
        body: messageFor(appt, appt.barbershop),
        status: "SENT",
      },
    }),
    db.interaction.create({
      data: {
        barbershopId,
        customerId: appt.customerId,
        type: "WHATSAPP",
        content: `Pedido de confirmação enviado pelo WhatsApp da barbearia (${whenLabel(appt.startsAt, appt.barbershop.timezone)})`,
        createdBy: by,
      },
    }),
  ]);
}

/** Desfaz o "enviado" (a pessoa tocou em Enviar mas não mandou a mensagem). */
export async function undoConfirmationSent(appointmentId: string, barbershopId: string) {
  const appt = await db.appointment.findFirst({ where: { id: appointmentId, barbershopId } });
  if (!appt || !appt.reminderSentAt) return;
  const last = await db.messageLog.findFirst({
    where: { appointmentId, provider: "MANUAL" },
    orderBy: { createdAt: "desc" },
  });
  await db.$transaction([
    db.appointment.update({ where: { id: appointmentId }, data: { reminderSentAt: null } }),
    ...(last ? [db.messageLog.delete({ where: { id: last.id } })] : []),
  ]);
}

/** Tira o horário da fila sem enviar (ex.: cliente já avisou por outro meio). */
export async function skipConfirmation(appointmentId: string, barbershopId: string, by?: string) {
  const appt = await db.appointment.findFirst({ where: { id: appointmentId, barbershopId } });
  if (!appt) return;
  await db.$transaction([
    db.appointment.update({ where: { id: appointmentId }, data: { confirmationSkippedAt: new Date() } }),
    db.interaction.create({
      data: { barbershopId, customerId: appt.customerId, type: "WHATSAPP", content: "Pedido de confirmação dispensado pela equipe", createdBy: by },
    }),
  ]);
}

/** Envio pela API oficial. Se falhar, o item volta para a fila manual. */
export async function sendConfirmationViaApi(appointmentId: string, by?: string) {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { customer: true, service: true, professional: true, barbershop: true },
  });
  if (!appt || appt.status !== "CONFIRMED" || appt.startsAt <= new Date()) return { ok: false, error: "Agendamento não está ativo" };
  const claim = await db.appointment.updateMany({ where: { id: appt.id, reminderSentAt: null }, data: { reminderSentAt: new Date() } });
  if (claim.count === 0) return { ok: false, error: "Pedido já enviado" };

  const shop = appt.barbershop;
  const when = whenLabel(appt.startsAt, shop.timezone);
  const result = await sendConfirmationWhatsApp({
    to: appt.customer.phone,
    firstName: firstName(appt.customer.name),
    when,
    service: `${appt.service.name} com ${appt.professional.name}`,
    token: appt.publicToken,
  });

  await db.$transaction([
    ...(result.ok
      ? []
      : [db.appointment.update({ where: { id: appt.id }, data: { reminderSentAt: null, confirmationAutoFailedAt: new Date() } })]),
    db.messageLog.create({
      data: {
        barbershopId: shop.id,
        customerId: appt.customerId,
        appointmentId: appt.id,
        kind: "CONFIRMATION_REQUEST",
        provider: "META",
        to: appt.customer.phone,
        body: messageFor(appt, shop),
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
          ? `Pedido de confirmação enviado automaticamente (${when})`
          : `⚠️ Envio automático falhou (${result.error}) — ficou na fila para envio manual`,
        createdBy: by,
      },
    }),
  ]);
  return { ok: result.ok, error: result.error };
}

/**
 * Rotina (a cada minuto). Só envia sozinha quando a API oficial está configurada;
 * no modo assistido a fila é montada na hora em que a tela é aberta, então não há o que fazer.
 */
export async function runConfirmationJob(now = new Date()) {
  if (whatsappProvider() !== "META") return { mode: "ASSISTIDO", sent: 0, failed: 0 };
  const shops = await db.barbershop.findMany({ where: { confirmationEnabled: true } });
  let sent = 0;
  let failed = 0;
  for (const shop of shops) {
    const { ready } = await getConfirmationQueue(shop, now);
    for (const item of ready) {
      if (item.appointment.confirmationAutoFailedAt) continue; // já falhou: fica para a equipe
      const r = await sendConfirmationViaApi(item.appointment.id);
      if (r.ok) sent++;
      else if (r.error !== "Pedido já enviado") failed++;
    }
  }
  return { mode: "META", sent, failed };
}

/** Situação da confirmação de presença de um horário, para a agenda. */
export function attendanceState(
  a: Pick<Appointment, "status" | "startsAt" | "createdAt" | "reminderSentAt" | "attendanceConfirmedAt" | "confirmationSkippedAt">,
  shop: ShopCfg,
  now = new Date(),
) {
  if (a.attendanceConfirmedAt) return { tone: "green", label: "Presença confirmada" } as const;
  if (a.status !== "CONFIRMED" || a.startsAt <= now) return null;
  if (a.reminderSentAt) return { tone: "amber", label: "Aguardando resposta" } as const;
  if (!shop.confirmationEnabled) return { tone: "stone", label: "Sem confirmação" } as const;
  if (a.confirmationSkippedAt) return { tone: "stone", label: "Confirmação dispensada" } as const;
  const { dueAt, releaseAt } = confirmationTiming(a.startsAt, shop);
  if (a.createdAt > dueAt) return { tone: "stone", label: "Marcou em cima da hora" } as const;
  if (releaseAt <= now) return { tone: "violet", label: "Na fila para enviar" } as const;
  return { tone: "stone", label: `Entra na fila às ${timeInTz(releaseAt, shop.timezone)}` } as const;
}
