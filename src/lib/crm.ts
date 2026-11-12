import "server-only";
import type { Customer } from "@prisma/client";
import { db } from "./db";
import { dateKeyInTz } from "./time";

export type CustomerWithStats = Customer & {
  visits: number;
  totalSpentCents: number;
  lastVisit: Date | null;
  firstVisit: Date | null;
  nextAppointment: Date | null;
  avgIntervalDays: number | null;
  isClient: boolean;
  isInactive: boolean;
  daysSinceLastVisit: number | null;
};

export const SEGMENTS = {
  todos: "Todos",
  clientes: "Clientes",
  leads: "Leads",
  sumidos: "Sumidos",
  aniversariantes: "Aniversariantes do mês",
  novos: "Novos (30 dias)",
} as const;
export type Segment = keyof typeof SEGMENTS;

const DAY = 86_400_000;

export async function getCustomersWithStats(shop: { id: string; inactiveAfterDays: number }): Promise<CustomerWithStats[]> {
  const now = new Date();
  const [customers, done, upcoming] = await Promise.all([
    db.customer.findMany({ where: { barbershopId: shop.id }, orderBy: { createdAt: "desc" } }),
    db.appointment.groupBy({
      by: ["customerId"],
      where: { barbershopId: shop.id, status: "COMPLETED" },
      _count: { _all: true },
      _sum: { priceCents: true },
      _max: { startsAt: true },
      _min: { startsAt: true },
    }),
    db.appointment.groupBy({
      by: ["customerId"],
      where: { barbershopId: shop.id, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] }, startsAt: { gt: now } },
      _min: { startsAt: true },
    }),
  ]);
  const doneMap = new Map(done.map((d) => [d.customerId, d]));
  const upMap = new Map(upcoming.map((u) => [u.customerId, u._min.startsAt]));

  return customers.map((c) => {
    const d = doneMap.get(c.id);
    const visits = d?._count._all ?? 0;
    const lastVisit = d?._max.startsAt ?? null;
    const firstVisit = d?._min.startsAt ?? null;
    const nextAppointment = upMap.get(c.id) ?? null;
    const daysSinceLastVisit = lastVisit ? Math.floor((now.getTime() - lastVisit.getTime()) / DAY) : null;
    return {
      ...c,
      visits,
      totalSpentCents: d?._sum.priceCents ?? 0,
      lastVisit,
      firstVisit,
      nextAppointment,
      avgIntervalDays:
        visits > 1 && lastVisit && firstVisit
          ? Math.round((lastVisit.getTime() - firstVisit.getTime()) / DAY / (visits - 1))
          : null,
      isClient: visits > 0 || c.leadStatus === "CONVERTED",
      isInactive: visits > 0 && !nextAppointment && (daysSinceLastVisit ?? 0) > shop.inactiveAfterDays,
      daysSinceLastVisit,
    };
  });
}

export function filterSegment(list: CustomerWithStats[], segment: Segment, tz: string): CustomerWithStats[] {
  const now = new Date();
  const month = dateKeyInTz(now, tz).slice(5, 7);
  switch (segment) {
    case "clientes":
      return list.filter((c) => c.isClient);
    case "leads":
      return list.filter((c) => !c.isClient);
    case "sumidos":
      return list.filter((c) => c.isInactive).sort((a, b) => (b.daysSinceLastVisit ?? 0) - (a.daysSinceLastVisit ?? 0));
    case "aniversariantes":
      return list
        .filter((c) => c.birthday && c.birthday.toISOString().slice(5, 7) === month)
        .sort((a, b) => a.birthday!.toISOString().slice(8, 10).localeCompare(b.birthday!.toISOString().slice(8, 10)));
    case "novos":
      return list.filter((c) => now.getTime() - c.createdAt.getTime() < 30 * DAY);
    default:
      return list;
  }
}

export function searchCustomers(list: CustomerWithStats[], q: string) {
  const term = q.trim().toLowerCase();
  if (!term) return list;
  const digits = term.replace(/\D/g, "");
  return list.filter(
    (c) =>
      c.name.toLowerCase().includes(term) ||
      (digits.length >= 3 && c.phone.includes(digits)) ||
      c.email?.toLowerCase().includes(term) ||
      c.tags.some((t) => t.toLowerCase().includes(term)),
  );
}

export async function logInteraction(data: {
  barbershopId: string;
  customerId: string;
  type: string;
  content: string;
  createdBy?: string;
}) {
  return db.interaction.create({ data });
}
