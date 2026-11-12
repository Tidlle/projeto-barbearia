import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCustomersWithStats } from "@/lib/crm";
import { db } from "@/lib/db";
import { formatMoney, formatPhone, SOURCE_LABEL, STATUS_LABEL } from "@/lib/format";
import { addDaysToKey, dateKeyInTz, formatDate, timeInTz, zonedToUtc } from "@/lib/time";
import { appUrl, WHATSAPP_TEMPLATES } from "@/lib/whatsapp";
import { Stat, relativeDays } from "@/components/painel";
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader, STATUS_TONE } from "@/components/ui";
import { WhatsAppButton } from "@/components/whatsapp-button";

export default async function OverviewPage() {
  const user = await requireUser();
  const shop = user.barbershop;
  const tz = shop.timezone;
  const now = new Date();
  const todayKey = dateKeyInTz(now, tz);
  const dayStart = zonedToUtc(todayKey, "00:00", tz);
  const dayEnd = zonedToUtc(addDaysToKey(todayKey, 1), "00:00", tz);
  const monthStart = zonedToUtc(`${todayKey.slice(0, 8)}01`, "00:00", tz);
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d7 = new Date(now.getTime() - 7 * 86_400_000);

  const [today, monthDone, last30, customers, recentLeads] = await Promise.all([
    db.appointment.findMany({
      where: { barbershopId: shop.id, startsAt: { gte: dayStart, lt: dayEnd }, status: { in: ["CONFIRMED", "COMPLETED", "PENDING_PAYMENT", "NO_SHOW"] } },
      include: { customer: true, service: true, professional: true },
      orderBy: { startsAt: "asc" },
    }),
    db.appointment.aggregate({
      where: { barbershopId: shop.id, status: "COMPLETED", startsAt: { gte: monthStart } },
      _sum: { priceCents: true },
      _count: { _all: true },
    }),
    db.appointment.groupBy({
      by: ["status"],
      where: { barbershopId: shop.id, startsAt: { gte: d30, lt: now }, status: { in: ["COMPLETED", "NO_SHOW"] } },
      _count: { _all: true },
    }),
    getCustomersWithStats(shop),
    db.customer.findMany({
      where: { barbershopId: shop.id, leadStatus: { in: ["NEW", "CONTACTED"] }, appointments: { none: { status: { in: ["COMPLETED", "CONFIRMED"] } } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { interactions: { where: { type: "BOOKING_STARTED" }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ]);

  const active = today.filter((a) => a.status !== "NO_SHOW");
  const expectedToday = active.reduce((s, a) => s + a.priceCents, 0);
  const upcoming = active.filter((a) => a.endsAt > now);
  const completed30 = last30.find((g) => g.status === "COMPLETED")?._count._all ?? 0;
  const noShow30 = last30.find((g) => g.status === "NO_SHOW")?._count._all ?? 0;
  const noShowRate = completed30 + noShow30 ? Math.round((noShow30 / (completed30 + noShow30)) * 100) : 0;
  const newLeads7 = customers.filter((c) => !c.isClient && c.createdAt > d7).length;
  const inactive = customers.filter((c) => c.isInactive);
  const weekBirthdays = customers.filter((c) => {
    if (!c.birthday) return false;
    const md = c.birthday.toISOString().slice(5, 10);
    return Array.from({ length: 7 }, (_, i) => addDaysToKey(todayKey, i).slice(5, 10)).includes(md);
  });
  const bookingUrl = appUrl("/agendar");

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(" ")[0]}`}
        description={formatDate(now, tz, { weekday: "long", day: "numeric", month: "long" })}
        actions={
          <>
            <LinkButton href="/painel/agenda" variant="outline">Abrir agenda</LinkButton>
            <LinkButton href="/" target="_blank" variant="brand">Ver site ↗</LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Atendimentos hoje" value={active.length} hint={`${formatMoney(expectedToday)} previstos`} />
        <Stat label="Faturamento do mês" value={formatMoney(monthDone._sum.priceCents ?? 0)} hint={`${monthDone._count._all} atendimentos concluídos`} />
        <Stat label="Novos leads (7 dias)" value={newLeads7} hint="pessoas que tentaram agendar" />
        <Stat label="Faltas (30 dias)" value={`${noShowRate}%`} hint={`${noShow30} de ${completed30 + noShow30} atendimentos`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
            <h2 className="font-semibold">Próximos de hoje</h2>
            <Link href="/painel/agenda" className="text-sm text-stone-500 hover:text-stone-900">Ver agenda →</Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="p-5"><EmptyState title="Nenhum atendimento restante hoje" /></div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {upcoming.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-12 font-mono text-sm font-semibold tabular-nums">{timeInTz(a.startsAt, tz)}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/painel/clientes/${a.customerId}`} className="font-medium hover:underline">{a.customer.name}</Link>
                    <p className="truncate text-sm text-stone-500">{a.service.name} · {a.professional.name}</p>
                  </div>
                  <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                  <WhatsAppButton
                    customerId={a.customerId}
                    phone={a.customer.phone}
                    variant="ghost"
                    logLabel="Lembrete de horário"
                    text={WHATSAPP_TEMPLATES.lembrete.build({
                      customerName: a.customer.name,
                      shopName: shop.name,
                      bookingUrl,
                      when: `hoje às ${timeInTz(a.startsAt, tz)}`,
                      professional: a.professional.name,
                    })}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
              <h2 className="font-semibold">Leads recentes</h2>
              <Link href="/painel/leads" className="text-sm text-stone-500 hover:text-stone-900">Todos →</Link>
            </div>
            {recentLeads.length === 0 ? (
              <p className="p-5 text-sm text-stone-500">Nenhum lead em aberto.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {recentLeads.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={l.name} className="size-8" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/painel/clientes/${l.id}`} className="block truncate text-sm font-medium hover:underline">{l.name}</Link>
                      <p className="truncate text-xs text-stone-500">
                        {SOURCE_LABEL[l.source ?? ""] ?? "—"} · {relativeDays(l.createdAt)}
                      </p>
                    </div>
                    <WhatsAppButton
                      customerId={l.id}
                      phone={l.phone}
                      variant="ghost"
                      logLabel="Retomar agendamento"
                      text={WHATSAPP_TEMPLATES.lead.build({ customerName: l.name, shopName: shop.name, bookingUrl })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">Oportunidades</h2>
            <ul className="mt-3 space-y-3 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span>
                  <strong>{inactive.length}</strong> clientes sumidos há mais de {shop.inactiveAfterDays} dias
                </span>
                <Link href="/painel/clientes?segmento=sumidos" className="shrink-0 text-stone-500 hover:text-stone-900">Ver →</Link>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>
                  <strong>{weekBirthdays.length}</strong> aniversariantes nos próximos 7 dias
                </span>
                <Link href="/painel/clientes?segmento=aniversariantes" className="shrink-0 text-stone-500 hover:text-stone-900">Ver →</Link>
              </li>
            </ul>
            {weekBirthdays.slice(0, 3).map((c) => (
              <div key={c.id} className="mt-3 flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
                <span>
                  🎂 {c.name} <span className="text-stone-500">· {c.birthday!.toISOString().slice(8, 10)}/{c.birthday!.toISOString().slice(5, 7)}</span>
                </span>
                <WhatsAppButton
                  customerId={c.id}
                  phone={c.phone}
                  variant="ghost"
                  logLabel="Feliz aniversário"
                  text={WHATSAPP_TEMPLATES.aniversario.build({ customerName: c.name, shopName: shop.name, bookingUrl })}
                />
              </div>
            ))}
          </Card>

          <Card className="p-5 text-sm">
            <h2 className="font-semibold">Seu link de agendamento</h2>
            <p className="mt-1 text-stone-500">Coloque na bio do Instagram e no Google. Use <code>?origem=instagram</code> para saber de onde vêm os clientes.</p>
            <p className="mt-3 break-all rounded-lg bg-stone-100 px-3 py-2 font-mono text-xs">{appUrl("/?origem=instagram")}</p>
            <p className="mt-2 text-xs text-stone-400">WhatsApp da barbearia: {formatPhone(shop.whatsapp)}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
