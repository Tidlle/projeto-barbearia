import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { brandStyle, getShopBySlug } from "@/lib/shop";
import { dateKeyInTz } from "@/lib/time";
import { BookingWizard } from "./booking-wizard";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ servico?: string; profissional?: string; origem?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await getShopBySlug((await params).slug);
  return shop ? { title: `Agendar — ${shop.name}` } : {};
}

export default async function BookingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const shop = await getShopBySlug(slug);
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

  return (
    <div style={brandStyle(shop.primaryColor)} className="min-h-screen bg-[#0d0c0b] text-stone-200">
      <BookingWizard
        slug={shop.slug}
        shopName={shop.name}
        timezone={shop.timezone}
        todayKey={dateKeyInTz(new Date(), shop.timezone)}
        maxAdvanceDays={shop.maxAdvanceDays}
        paymentMode={shop.paymentMode}
        depositPercent={shop.depositPercent}
        holdMinutes={shop.holdMinutes}
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
