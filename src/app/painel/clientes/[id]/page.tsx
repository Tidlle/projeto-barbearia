import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, formatPhone, LEAD_STATUS_LABEL, SOURCE_LABEL, STATUS_LABEL } from "@/lib/format";
import { dateKeyInTz, formatDate, formatWhen, timeInTz } from "@/lib/time";
import { appUrl, WHATSAPP_TEMPLATES } from "@/lib/whatsapp";
import { addNote, deleteCustomer, setLeadStatus, updateCustomer } from "../../actions";
import { Flash, Stat, relativeDays } from "@/components/painel";
import { ConfirmSubmit, SubmitButton } from "@/components/submit-button";
import { Avatar, Badge, Card, Field, Input, LEAD_TONE, PageHeader, STATUS_TONE, Select, Textarea, cn } from "@/components/ui";
import { WhatsAppButton } from "@/components/whatsapp-button";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> };

const TIMELINE_ICON: Record<string, string> = {
  NOTE: "📝",
  WHATSAPP: "💬",
  BOOKING_STARTED: "👀",
  BOOKING_CREATED: "📅",
  BOOKING_STATUS: "✂️",
  PAYMENT: "💳",
  LEAD_STATUS: "➜",
  IMPORT: "⤓",
};

function mode<T>(arr: T[]): T | undefined {
  const m = new Map<T, number>();
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export default async function CustomerPage({ params, searchParams }: Props) {
  const user = await requireUser();
  const shop = user.barbershop;
  const tz = shop.timezone;
  const { id } = await params;
  const sp = await searchParams;

  const customer = await db.customer.findFirst({
    where: { id, barbershopId: shop.id },
    include: {
      appointments: { include: { service: true, professional: true }, orderBy: { startsAt: "desc" } },
      interactions: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!customer) notFound();

  const now = new Date();
  const done = customer.appointments.filter((a) => a.status === "COMPLETED");
  const noShows = customer.appointments.filter((a) => a.status === "NO_SHOW").length;
  const total = done.reduce((s, a) => s + a.priceCents, 0);
  const last = done[0]?.startsAt;
  const first = done[done.length - 1]?.startsAt;
  const avgInterval = done.length > 1 && last && first ? Math.round((last.getTime() - first.getTime()) / 86_400_000 / (done.length - 1)) : null;
  const next = customer.appointments
    .filter((a) => a.startsAt > now && (a.status === "CONFIRMED" || a.status === "PENDING_PAYMENT"))
    .at(-1);
  const favService = mode(done.map((a) => a.service.name));
  const favPro = mode(done.map((a) => a.professional.name));
  const isClient = done.length > 0 || customer.leadStatus === "CONVERTED";
  const bookingUrl = appUrl("/agendar");
  const lastStarted = customer.interactions.find((i) => i.type === "BOOKING_STARTED");

  const ctx = {
    customerName: customer.name,
    shopName: shop.name,
    bookingUrl,
    reviewUrl: shop.googleMapsUrl,
    when: next ? formatWhen(next.startsAt, tz) : undefined,
    professional: next?.professional.name,
    serviceName: lastStarted?.content.match(/"(.+?)"/)?.[1],
  };
  const suggested = [
    next && "lembrete",
    !isClient && "lead",
    isClient && !next && "retorno",
    "aniversario",
    done.length > 0 && "avaliacao",
  ].filter(Boolean) as (keyof typeof WHATSAPP_TEMPLATES)[];

  return (
    <>
      <Link href="/painel/clientes" className="mb-4 inline-block text-sm text-stone-500 hover:text-stone-900">← Clientes</Link>
      <Flash ok={sp.ok} erro={sp.erro} />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar name={customer.name} className="size-14 text-base" />
        <div className="flex-1">
          <PageHeader
            title={customer.name}
            description={[formatPhone(customer.phone), customer.email, `cliente desde ${formatDate(customer.createdAt, tz, { month: "short", year: "numeric" })}`]
              .filter(Boolean)
              .join(" · ")}
          />
          <div className="-mt-4 flex flex-wrap gap-1.5">
            {isClient ? <Badge tone="green">Cliente</Badge> : <Badge tone={LEAD_TONE[customer.leadStatus]}>Lead · {LEAD_STATUS_LABEL[customer.leadStatus]}</Badge>}
            {customer.source && <Badge>Origem: {SOURCE_LABEL[customer.source] ?? customer.source}</Badge>}
            {customer.marketingConsent ? <Badge tone="blue">Aceita mensagens</Badge> : <Badge tone="red">Não aceita mensagens</Badge>}
            {customer.tags.map((t) => <Badge key={t}>{t}</Badge>)}
          </div>
        </div>
      </div>

      {/* Ações de WhatsApp */}
      <Card className="mb-6 flex flex-wrap items-center gap-2 p-4">
        <span className="mr-2 text-sm font-medium text-stone-600">WhatsApp:</span>
        {suggested.map((k) => (
          <WhatsAppButton key={k} customerId={customer.id} phone={customer.phone} label={WHATSAPP_TEMPLATES[k].label} logLabel={WHATSAPP_TEMPLATES[k].label} text={WHATSAPP_TEMPLATES[k].build(ctx)} variant={k === suggested[0] ? "whatsapp" : "outline"} />
        ))}
        <WhatsAppButton customerId={customer.id} phone={customer.phone} label="Conversa livre" logLabel="Conversa" variant="ghost" />
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat accent label="Visitas" value={done.length} hint={noShows ? `${noShows} falta(s)` : "nenhuma falta"} />
        <Stat label="Total gasto" value={formatMoney(total)} hint={done.length ? `ticket médio ${formatMoney(Math.round(total / done.length))}` : undefined} />
        <Stat label="Última visita" value={relativeDays(last)} hint={avgInterval ? `volta a cada ~${avgInterval} dias` : undefined} />
        <Stat
          label="Próximo horário"
          value={next ? formatDate(next.startsAt, tz, { day: "2-digit", month: "2-digit" }) : "—"}
          hint={next ? `${timeInTz(next.startsAt, tz)} · ${next.professional.name}` : favService ? `costuma fazer ${favService}` : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Linha do tempo */}
          <Card>
            <h2 className="border-b border-stone-100 px-5 py-4 font-semibold">Linha do tempo</h2>
            <form action={addNote} className="flex gap-2 border-b border-stone-100 p-4">
              <input type="hidden" name="customerId" value={customer.id} />
              <Input name="content" placeholder="Anotar algo sobre o cliente (preferências, conversa, etc.)" required />
              <SubmitButton pendingText="…">Anotar</SubmitButton>
            </form>
            <ul className="max-h-[480px] divide-y divide-stone-100 overflow-y-auto">
              {customer.interactions.map((i) => (
                <li key={i.id} className="flex gap-3 px-5 py-3 text-sm">
                  <span className="w-5 shrink-0 text-center">{TIMELINE_ICON[i.type] ?? "•"}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn(i.type === "NOTE" && "text-stone-900", i.type !== "NOTE" && "text-stone-600")}>{i.content}</p>
                    <p className="mt-0.5 text-xs text-stone-400">
                      {formatDate(i.createdAt, tz, { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {i.createdBy && ` · ${i.createdBy}`}
                    </p>
                  </div>
                </li>
              ))}
              {customer.interactions.length === 0 && <li className="px-5 py-6 text-center text-sm text-stone-500">Sem registros ainda.</li>}
            </ul>
          </Card>

          {/* Histórico */}
          <Card className="overflow-x-auto">
            <h2 className="border-b border-stone-100 px-5 py-4 font-semibold">
              Histórico de atendimentos
              {favPro && <span className="ml-2 text-sm font-normal text-stone-500">· costuma cortar com {favPro}</span>}
            </h2>
            <table className="w-full min-w-[520px] text-sm">
              <tbody className="divide-y divide-stone-100">
                {customer.appointments.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-3 tabular-nums">
                      <Link href={`/painel/agenda?data=${dateKeyInTz(a.startsAt, tz)}#appt-${a.id}`} className="hover:underline">
                        {formatDate(a.startsAt, tz, { day: "2-digit", month: "2-digit", year: "2-digit" })} {timeInTz(a.startsAt, tz)}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{a.service.name}</td>
                    <td className="px-5 py-3 text-stone-500">{a.professional.name}</td>
                    <td className="px-5 py-3 tabular-nums">{formatMoney(a.priceCents)}</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge></td>
                  </tr>
                ))}
                {customer.appointments.length === 0 && (
                  <tr><td className="px-5 py-6 text-center text-stone-500">Nenhum agendamento.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="space-y-6">
          {!isClient && (
            <Card className="p-5">
              <h2 className="font-semibold">Funil de lead</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["NEW", "CONTACTED", "LOST", "CONVERTED"] as const).map((s) => (
                  <form key={s} action={setLeadStatus}>
                    <input type="hidden" name="customerId" value={customer.id} />
                    <input type="hidden" name="status" value={s} />
                    <SubmitButton size="sm" variant={customer.leadStatus === s ? "primary" : "outline"} className="w-full" pendingText="…">
                      {LEAD_STATUS_LABEL[s]}
                    </SubmitButton>
                  </form>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Dados do cliente</h2>
            <form action={updateCustomer} className="space-y-3">
              <input type="hidden" name="id" value={customer.id} />
              <Field label="Nome"><Input name="name" required defaultValue={customer.name} /></Field>
              <Field label="WhatsApp"><Input name="phone" type="tel" required defaultValue={formatPhone(customer.phone)} /></Field>
              <Field label="E-mail"><Input name="email" type="email" defaultValue={customer.email ?? ""} /></Field>
              <Field label="Aniversário">
                <Input name="birthday" placeholder="dd/mm/aaaa" defaultValue={customer.birthday ? customer.birthday.toISOString().slice(0, 10).split("-").reverse().join("/") : ""} />
              </Field>
              <Field label="Origem">
                <Select name="source" defaultValue={customer.source ?? ""}>
                  <option value="">—</option>
                  {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Tags" hint="Separe por vírgula. Ex.: VIP, Prefere tesoura"><Input name="tags" defaultValue={customer.tags.join(", ")} /></Field>
              <Field label="Observações fixas"><Textarea name="notes" rows={3} defaultValue={customer.notes ?? ""} /></Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="consent" defaultChecked={customer.marketingConsent} className="size-4 accent-stone-900" />
                Aceita receber mensagens de marketing
              </label>
              <SubmitButton className="w-full">Salvar</SubmitButton>
            </form>
          </Card>

          <form action={deleteCustomer} className="text-center">
            <input type="hidden" name="id" value={customer.id} />
            <ConfirmSubmit variant="ghost" size="sm" className="text-red-600" message={`Excluir ${customer.name} e todo o histórico? Isso não pode ser desfeito.`}>
              Excluir cliente (LGPD)
            </ConfirmSubmit>
          </form>
        </div>
      </div>
    </>
  );
}
