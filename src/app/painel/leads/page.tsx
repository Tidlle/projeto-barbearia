import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPhone, SOURCE_LABEL } from "@/lib/format";
import { daysAgo } from "@/lib/time";
import { appUrl, WHATSAPP_TEMPLATES } from "@/lib/whatsapp";
import { setLeadStatus } from "../actions";
import { Stat, relativeDays } from "@/components/painel";
import { SubmitButton } from "@/components/submit-button";
import { Card, PageHeader } from "@/components/ui";
import { WhatsAppButton } from "@/components/whatsapp-button";

const COLUMNS = [
  { status: "NEW", title: "Novos", hint: "Tentaram agendar e não concluíram", color: "bg-violet-500" },
  { status: "CONTACTED", title: "Em contato", hint: "Você já chamou no WhatsApp", color: "bg-amber-500" },
  { status: "LOST", title: "Perdidos", hint: "Não responderam ou desistiram", color: "bg-stone-400" },
] as const;

export default async function LeadsPage() {
  const user = await requireUser();
  const shop = user.barbershop;
  const d30 = daysAgo(30);

  const [leads, created30, converted30, bySource] = await Promise.all([
    db.customer.findMany({
      where: {
        barbershopId: shop.id,
        leadStatus: { in: ["NEW", "CONTACTED", "LOST"] },
        appointments: { none: { status: { in: ["COMPLETED", "CONFIRMED"] } } },
      },
      orderBy: { createdAt: "desc" },
      include: { interactions: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    db.customer.count({ where: { barbershopId: shop.id, createdAt: { gte: d30 }, source: { notIn: ["importado"] } } }),
    db.customer.count({ where: { barbershopId: shop.id, createdAt: { gte: d30 }, leadStatus: "CONVERTED", source: { notIn: ["importado"] } } }),
    db.customer.groupBy({ by: ["source"], where: { barbershopId: shop.id, createdAt: { gte: d30 } }, _count: { _all: true } }),
  ]);
  const bookingUrl = appUrl("/agendar");
  const conversion = created30 ? Math.round((converted30 / created30) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Leads"
        description="Quem deixou o contato no site mas ainda não virou cliente. Chame no WhatsApp enquanto o interesse está quente."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Leads em aberto" value={leads.filter((l) => l.leadStatus !== "LOST").length} />
        <Stat label="Contatos novos (30d)" value={created30} />
        <Stat label="Conversão (30d)" value={`${conversion}%`} hint={`${converted30} viraram clientes`} />
        <Stat
          label="Principal origem (30d)"
          value={SOURCE_LABEL[[...bySource].sort((a, b) => b._count._all - a._count._all)[0]?.source ?? ""] ?? "—"}
          hint={bySource.map((s) => `${SOURCE_LABEL[s.source ?? ""] ?? "?"}: ${s._count._all}`).join(" · ")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = leads.filter((l) => l.leadStatus === col.status);
          return (
            <section key={col.status} className="rounded-xl bg-stone-100/80 p-3">
              <header className="mb-3 px-1">
                <h2 className="flex items-center gap-2 font-semibold">
                  <span className={`size-2 rounded-full ${col.color}`} />
                  {col.title} <span className="text-sm font-normal text-stone-500">{items.length}</span>
                </h2>
                <p className="text-xs text-stone-500">{col.hint}</p>
              </header>
              <div className="space-y-2">
                {items.map((l) => (
                  <Card key={l.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/painel/clientes/${l.id}`} className="block truncate font-medium hover:underline">{l.name}</Link>
                        <p className="text-xs text-stone-500">
                          {formatPhone(l.phone)} · {SOURCE_LABEL[l.source ?? ""] ?? "—"} · {relativeDays(l.createdAt)}
                        </p>
                      </div>
                      <WhatsAppButton
                        customerId={l.id}
                        phone={l.phone}
                        logLabel="Retomar agendamento"
                        text={WHATSAPP_TEMPLATES.lead.build({
                          customerName: l.name,
                          shopName: shop.name,
                          bookingUrl,
                          serviceName: l.interactions[0]?.content.match(/"(.+?)"/)?.[1],
                        })}
                      />
                    </div>
                    {l.interactions[0] && <p className="mt-2 line-clamp-2 rounded-md bg-stone-50 px-2 py-1.5 text-xs text-stone-600">{l.interactions[0].content}</p>}
                    <div className="mt-2 flex gap-1">
                      {COLUMNS.filter((c) => c.status !== col.status).map((c) => (
                        <form key={c.status} action={setLeadStatus}>
                          <input type="hidden" name="customerId" value={l.id} />
                          <input type="hidden" name="status" value={c.status} />
                          <SubmitButton size="sm" variant="ghost" className="h-7 px-2 text-xs" pendingText="…">→ {c.title}</SubmitButton>
                        </form>
                      ))}
                    </div>
                  </Card>
                ))}
                {items.length === 0 && <p className="px-1 py-4 text-center text-sm text-stone-400">Vazio</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
