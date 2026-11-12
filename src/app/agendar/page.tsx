import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { brandStyle, getShop } from "@/lib/shop";
import { addDaysToKey, dateKeyInTz, minutesOf, timeInTz, weekdayOf } from "@/lib/time";
import { BookingWizard } from "./booking-wizard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agendar horário" };

type Props = { searchParams: Promise<{ servico?: string; profissional?: string; origem?: string }> };

export default async function BookingPage({ searchParams }: Props) {
  const sp = await searchParams;
  const shop = await getShop();
  if (!shop) notFound();

  const [services, professionals] = await Promise.all([
    db.service.findMany({
      where: { barbershopId: shop.id, active: true, professionals: { some: { professional: { active: true } } } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, description: true, category: true, durationMinutes: true, priceCents: true },
    }),
    db.professional.findMany({
      where: { barbershopId: shop.id, active: true },
      orderBy: { sortOrder: "asc" },
      include: { services: { select: { serviceId: true } }, workingHours: { select: { weekday: true } } },
    }),
  ]);

  // depois do último horário possível de hoje, o assistente já abre no próximo dia
  const now = new Date();
  const todayKey = dateKeyInTz(now, shop.timezone);
  const nowM = minutesOf(timeInTz(now, shop.timezone)) + shop.minAdvanceMinutes;
  const todayStillOpen = shop.businessHours.some((h) => h.weekday === weekdayOf(todayKey) && minutesOf(h.closeTime) - 15 > nowM);
  const firstDateKey = todayStillOpen ? todayKey : addDaysToKey(todayKey, 1);

  return (
    <div style={brandStyle(shop.primaryColor)} className="paper min-h-screen text-tinta">
      <BookingWizard
        shopName={shop.name}
        timezone={shop.timezone}
        todayKey={todayKey}
        firstDateKey={firstDateKey}
        maxAdvanceDays={shop.maxAdvanceDays}
        paymentMode={shop.paymentMode}
        depositPercent={shop.depositPercent}
        holdMinutes={shop.holdMinutes}
        confirmationLeadMinutes={shop.confirmationEnabled ? shop.confirmationLeadMinutes : null}
        cancellationPolicy={shop.cancellationPolicy}
        services={services}
        professionals={professionals.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          serviceIds: p.services.map((s) => s.serviceId),
          weekdays: [...new Set(p.workingHours.map((w) => w.weekday))],
        }))}
        initialServiceId={services.some((s) => s.id === sp.servico) ? sp.servico : undefined}
        initialProfessionalId={professionals.some((p) => p.id === sp.profissional) ? sp.profissional : undefined}
        source={sp.origem}
      />
    </div>
  );
}
