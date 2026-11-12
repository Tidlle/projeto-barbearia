import type { Barbershop, Prisma } from "@prisma/client";
import { db } from "./db";
import { addDaysToKey, dateKeyInTz, minutesOf, timeOfMinutes, weekdayOf, zonedToUtc } from "./time";

/** Agendamentos que ocupam a agenda (pendentes só enquanto a reserva não expira). */
export function busyAppointmentWhere(now: Date): Prisma.AppointmentWhereInput {
  return {
    OR: [
      { status: { in: ["CONFIRMED", "COMPLETED"] } },
      { status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } },
    ],
  };
}

export type Slot = { time: string; startsAt: string; professionalIds: string[] };

type Shop = Pick<
  Barbershop,
  "id" | "timezone" | "slotIntervalMinutes" | "minAdvanceMinutes" | "maxAdvanceDays"
>;

export async function getDaySlots(params: {
  shop: Shop;
  serviceId: string;
  professionalId?: string | null;
  dateKey: string;
  /** ignora antecedência mínima (uso interno do painel) */
  ignoreAdvance?: boolean;
}): Promise<{ slots: Slot[]; load: Record<string, number>; durationMinutes: number } | null> {
  const { shop, serviceId, professionalId, dateKey } = params;
  const tz = shop.timezone;
  const now = new Date();

  const service = await db.service.findFirst({ where: { id: serviceId, barbershopId: shop.id, active: true } });
  if (!service) return null;

  const todayKey = dateKeyInTz(now, tz);
  if (!params.ignoreAdvance && (dateKey < todayKey || dateKey > addDaysToKey(todayKey, shop.maxAdvanceDays))) {
    return { slots: [], load: {}, durationMinutes: service.durationMinutes };
  }

  const weekday = weekdayOf(dateKey);
  const professionals = await db.professional.findMany({
    where: {
      barbershopId: shop.id,
      active: true,
      services: { some: { serviceId } },
      ...(professionalId ? { id: professionalId } : {}),
    },
    include: { workingHours: { where: { weekday } } },
    orderBy: { sortOrder: "asc" },
  });
  if (professionals.length === 0) return { slots: [], load: {}, durationMinutes: service.durationMinutes };

  const ids = professionals.map((p) => p.id);
  const dayStart = zonedToUtc(dateKey, "00:00", tz);
  const dayEnd = zonedToUtc(addDaysToKey(dateKey, 1), "00:00", tz);

  const [appointments, timeOffs] = await Promise.all([
    db.appointment.findMany({
      where: {
        professionalId: { in: ids },
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
        ...busyAppointmentWhere(now),
      },
      select: { professionalId: true, startsAt: true, endsAt: true },
    }),
    db.timeOff.findMany({
      where: {
        barbershopId: shop.id,
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
        OR: [{ professionalId: null }, { professionalId: { in: ids } }],
      },
      select: { professionalId: true, startsAt: true, endsAt: true },
    }),
  ]);

  const load: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const a of appointments) load[a.professionalId] = (load[a.professionalId] ?? 0) + 1;

  const earliest = params.ignoreAdvance ? 0 : now.getTime() + shop.minAdvanceMinutes * 60_000;
  const durationMs = service.durationMinutes * 60_000;
  const step = Math.max(5, shop.slotIntervalMinutes);
  const byTime = new Map<string, Slot>();

  for (const prof of professionals) {
    const busy = [
      ...appointments.filter((a) => a.professionalId === prof.id),
      ...timeOffs.filter((t) => t.professionalId === null || t.professionalId === prof.id),
    ];
    for (const wh of prof.workingHours) {
      const endM = minutesOf(wh.endTime);
      for (let m = minutesOf(wh.startTime); m + service.durationMinutes <= endM; m += step) {
        const time = timeOfMinutes(m);
        const start = zonedToUtc(dateKey, time, tz).getTime();
        const end = start + durationMs;
        if (start < earliest) continue;
        if (busy.some((b) => b.startsAt.getTime() < end && b.endsAt.getTime() > start)) continue;
        const slot = byTime.get(time) ?? { time, startsAt: new Date(start).toISOString(), professionalIds: [] };
        slot.professionalIds.push(prof.id);
        byTime.set(time, slot);
      }
    }
  }

  const slots = [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
  return { slots, load, durationMinutes: service.durationMinutes };
}

/**
 * Confere se o horário ainda está livre e devolve o profissional que vai atender
 * (quando o cliente escolheu "sem preferência", pega o menos ocupado do dia).
 */
export async function resolveSlot(params: {
  shop: Shop;
  serviceId: string;
  professionalId?: string | null;
  startsAt: Date;
}): Promise<{ professionalId: string; endsAt: Date } | null> {
  const dateKey = dateKeyInTz(params.startsAt, params.shop.timezone);
  const result = await getDaySlots({ ...params, dateKey });
  if (!result) return null;
  const slot = result.slots.find((s) => new Date(s.startsAt).getTime() === params.startsAt.getTime());
  if (!slot) return null;
  let chosen: string | undefined;
  if (params.professionalId) {
    chosen = slot.professionalIds.includes(params.professionalId) ? params.professionalId : undefined;
  } else {
    chosen = [...slot.professionalIds].sort((a, b) => (result.load[a] ?? 0) - (result.load[b] ?? 0))[0];
  }
  if (!chosen) return null;
  return { professionalId: chosen, endsAt: new Date(params.startsAt.getTime() + result.durationMinutes * 60_000) };
}

/** Verificação final dentro da transação, contra corrida entre dois clientes. */
export async function hasConflict(
  tx: Prisma.TransactionClient,
  professionalId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
): Promise<boolean> {
  const count = await tx.appointment.count({
    where: {
      professionalId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      ...busyAppointmentWhere(new Date()),
    },
  });
  return count > 0;
}
