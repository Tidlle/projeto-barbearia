import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { filterSegment, getCustomersWithStats, searchCustomers, SEGMENTS, type Segment } from "@/lib/crm";
import { formatDate } from "@/lib/time";
import { formatMoney, formatPhone, LEAD_STATUS_LABEL, SOURCE_LABEL } from "@/lib/format";
import { appUrl, WHATSAPP_TEMPLATES } from "@/lib/whatsapp";
import { createCustomer, importCustomers } from "../actions";
import { Flash, relativeDays } from "@/components/painel";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, Badge, Card, EmptyState, Field, Input, LEAD_TONE, LinkButton, PageHeader, Select, cn } from "@/components/ui";
import { WhatsAppButton } from "@/components/whatsapp-button";

type Props = { searchParams: Promise<{ q?: string; segmento?: string; ok?: string; erro?: string }> };

export default async function CustomersPage({ searchParams }: Props) {
  const user = await requireUser();
  const shop = user.barbershop;
  const sp = await searchParams;
  const segment: Segment = sp.segmento && sp.segmento in SEGMENTS ? (sp.segmento as Segment) : "todos";
  const all = await getCustomersWithStats(shop);
  const list = searchCustomers(filterSegment(all, segment, shop.timezone), sp.q ?? "");
  const counts = Object.fromEntries(
    (Object.keys(SEGMENTS) as Segment[]).map((s) => [s, filterSegment(all, s, shop.timezone).length]),
  ) as Record<Segment, number>;
  const bookingUrl = appUrl(`/${shop.slug}/agendar`);

  // mensagem sugerida conforme o segmento
  const template =
    segment === "sumidos" ? "retorno" : segment === "aniversariantes" ? "aniversario" : segment === "leads" ? "lead" : null;

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(segment !== "todos" ? { segmento: segment } : {}), ...extra });
    return p.toString();
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        description={`${counts.clientes} clientes · ${counts.leads} leads · ticket médio ${formatMoney(avgTicket(all))}`}
        actions={
          <LinkButton variant="outline" href={`/painel/clientes/exportar?${qs({})}`} prefetch={false}>
            Exportar CSV
          </LinkButton>
        }
      />
      <Flash ok={sp.ok} erro={sp.erro} />

      <div className="no-scrollbar -mx-4 mb-4 flex gap-1 overflow-x-auto px-4">
        {(Object.keys(SEGMENTS) as Segment[]).map((s) => (
          <Link
            key={s}
            href={`/painel/clientes?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(s !== "todos" ? { segmento: s } : {}) })}`}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm transition",
              s === segment ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100",
            )}
          >
            {SEGMENTS[s]} <span className="ml-1 opacity-60">{counts[s]}</span>
          </Link>
        ))}
      </div>

      <form className="mb-4 flex gap-2">
        {segment !== "todos" && <input type="hidden" name="segmento" value={segment} />}
        <Input name="q" defaultValue={sp.q} placeholder="Buscar por nome, telefone, e-mail ou tag…" className="max-w-md" />
      </form>

      <div className="grid gap-6 xl:grid-cols-4">
        <Card className="overflow-x-auto xl:col-span-3">
          {list.length === 0 ? (
            <div className="p-6"><EmptyState title="Nenhum cliente encontrado" /></div>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Visitas</th>
                  <th className="px-4 py-3 font-medium">Total gasto</th>
                  <th className="px-4 py-3 font-medium">Última visita</th>
                  <th className="px-4 py-3 font-medium">Origem</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {list.map((c) => (
                  <tr key={c.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <Link href={`/painel/clientes/${c.id}`} className="flex items-center gap-3">
                        <Avatar name={c.name} className="size-8" />
                        <span className="min-w-0">
                          <span className="block font-medium hover:underline">{c.name}</span>
                          <span className="block text-xs text-stone-500">{formatPhone(c.phone)}</span>
                        </span>
                      </Link>
                      {(c.tags.length > 0 || !c.isClient || c.isInactive) && (
                        <div className="mt-1.5 flex flex-wrap gap-1 pl-11">
                          {!c.isClient && <Badge tone={LEAD_TONE[c.leadStatus]}>Lead · {LEAD_STATUS_LABEL[c.leadStatus]}</Badge>}
                          {c.isInactive && <Badge tone="red">Sumido</Badge>}
                          {c.tags.map((t) => <Badge key={t}>{t}</Badge>)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{c.visits}</td>
                    <td className="px-4 py-3 tabular-nums">{formatMoney(c.totalSpentCents)}</td>
                    <td className="px-4 py-3">
                      {relativeDays(c.lastVisit)}
                      {c.nextAppointment && (
                        <span className="block text-xs text-sky-700">
                          próximo: {formatDate(c.nextAppointment, shop.timezone, { day: "2-digit", month: "2-digit" })}
                        </span>
                      )}
                      {segment === "aniversariantes" && c.birthday && (
                        <span className="block text-xs text-stone-500">🎂 {c.birthday.toISOString().slice(8, 10)}/{c.birthday.toISOString().slice(5, 7)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-500">{SOURCE_LABEL[c.source ?? ""] ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <WhatsAppButton
                        customerId={c.id}
                        phone={c.phone}
                        variant={template ? "whatsapp" : "ghost"}
                        label={template ? WHATSAPP_TEMPLATES[template].label : undefined}
                        logLabel={template ? WHATSAPP_TEMPLATES[template].label : "Conversa"}
                        text={template ? WHATSAPP_TEMPLATES[template].build({ customerName: c.name, shopName: shop.name, bookingUrl }) : undefined}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Novo cliente</h2>
            <form action={createCustomer} className="space-y-3">
              <Field label="Nome"><Input name="name" required /></Field>
              <Field label="WhatsApp"><Input name="phone" type="tel" required /></Field>
              <Field label="Aniversário"><Input name="birthday" placeholder="dd/mm/aaaa" /></Field>
              <Field label="Origem">
                <Select name="source" defaultValue="balcao">
                  {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="consent" defaultChecked className="size-4 accent-stone-900" />
                Aceita receber mensagens
              </label>
              <SubmitButton className="w-full">Cadastrar</SubmitButton>
            </form>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">Importar planilha</h2>
            <p className="mt-1 text-xs text-stone-500">
              CSV com colunas <code>nome</code>, <code>telefone</code> e opcionais <code>email</code>, <code>aniversario</code>, <code>tags</code>,{" "}
              <code>observacoes</code>. Serve para trazer a base de outro sistema (ex.: Trinks).
            </p>
            <form action={importCustomers} className="mt-3 space-y-3">
              <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm" />
              <SubmitButton variant="outline" className="w-full" pendingText="Importando…">Importar</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}

function avgTicket(list: { visits: number; totalSpentCents: number }[]) {
  const visits = list.reduce((s, c) => s + c.visits, 0);
  return visits ? Math.round(list.reduce((s, c) => s + c.totalSpentCents, 0) / visits) : 0;
}
