import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, formatPhone, STATUS_LABEL } from "@/lib/format";
import {
  addDaysToKey,
  dateKeyInTz,
  formatDateKey,
  isValidDateKey,
  minutesOf,
  timeInTz,
  timeOfMinutes,
  weekdayOf,
  zonedToUtc,
} from "@/lib/time";
import { appUrl, waLink, WHATSAPP_TEMPLATES } from "@/lib/whatsapp";
import { createManualAppointment, createTimeOff, deleteTimeOff, setAppointmentStatus, setAttendanceConfirmed } from "../actions";
import { SendConfirmationButton } from "@/components/confirmation-buttons";
import { whatsappProvider } from "@/lib/messaging";
import { attendanceState, messageFor } from "@/lib/confirmations";
import { Flash } from "@/components/painel";
import { ConfirmSubmit, SubmitButton } from "@/components/submit-button";
import { Badge, Button, Card, EmptyState, Field, Input, LinkButton, PageHeader, STATUS_TONE, Select, cn } from "@/components/ui";
import { WhatsAppButton } from "@/components/whatsapp-button";

const PX = 1.6; // pixels por minuto

const BLOCK_STYLE: Record<string, string> = {
  CONFIRMED: "border-sky-300 bg-sky-50 text-sky-950",
  PENDING_PAYMENT: "border-amber-300 bg-amber-50 text-amber-950 border-dashed",
  COMPLETED: "border-emerald-300 bg-emerald-50 text-emerald-950",
  NO_SHOW: "border-red-300 bg-red-50 text-red-900 line-through",
};

type Props = { searchParams: Promise<{ data?: string; ok?: string; erro?: string }> };

export default async function AgendaPage({ searchParams }: Props) {
  const user = await requireUser();
  const shop = user.barbershop;
  const tz = shop.timezone;
  const sp = await searchParams;
  const now = new Date();
  const todayKey = dateKeyInTz(now, tz);
  const dateKey = isValidDateKey(sp.data) ? sp.data : todayKey;
  const weekday = weekdayOf(dateKey);
  const dayStart = zonedToUtc(dateKey, "00:00", tz);
  const dayEnd = zonedToUtc(addDaysToKey(dateKey, 1), "00:00", tz);

  const [professionals, appointments, timeOffs, services] = await Promise.all([
    db.professional.findMany({
      where: { barbershopId: shop.id },
      include: { workingHours: { where: { weekday } } },
      orderBy: { sortOrder: "asc" },
    }),
    db.appointment.findMany({
      where: {
        barbershopId: shop.id,
        startsAt: { gte: dayStart, lt: dayEnd },
        OR: [{ status: { in: ["CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"] } }, { status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } }],
      },
      include: { customer: true, service: true, professional: true },
      orderBy: { startsAt: "asc" },
    }),
    db.timeOff.findMany({
      where: { barbershopId: shop.id, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
      include: { professional: true },
      orderBy: { startsAt: "asc" },
    }),
    db.service.findMany({ where: { barbershopId: shop.id, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const onGrid = appointments.filter((a) => a.status !== "CANCELLED");
  const columns = professionals.filter((p) => p.active || onGrid.some((a) => a.professionalId === p.id));

  // faixa visível do dia
  const ranges = [
    ...columns.flatMap((p) => p.workingHours.map((w) => [minutesOf(w.startTime), minutesOf(w.endTime)])),
    ...onGrid.map((a) => [minutesOf(timeInTz(a.startsAt, tz)), minutesOf(timeInTz(a.startsAt, tz)) + (a.endsAt.getTime() - a.startsAt.getTime()) / 60_000]),
  ];
  const startM = ranges.length ? Math.floor(Math.min(...ranges.map((r) => r[0])) / 60) * 60 : 9 * 60;
  const endM = ranges.length ? Math.ceil(Math.max(...ranges.map((r) => r[1])) / 60) * 60 : 20 * 60;
  const height = (endM - startM) * PX;
  const hours = Array.from({ length: (endM - startM) / 60 + 1 }, (_, i) => startM + i * 60);
  const minuteOf = (d: Date) => {
    const m = (d.getTime() - dayStart.getTime()) / 60_000;
    return Math.min(Math.max(m, startM), endM);
  };
  const nowLine = dateKey === todayKey ? minuteOf(now) : null;

  const revenue = onGrid.filter((a) => a.status !== "NO_SHOW").reduce((s, a) => s + a.priceCents, 0);
  const bookingUrl = appUrl("/agendar");
  const autoWhatsApp = whatsappProvider() === "META";
  const label = formatDateKey(dateKey, { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <PageHeader
        title="Agenda"
        description={`${label.charAt(0).toUpperCase()}${label.slice(1)} · ${onGrid.length} atendimentos · ${formatMoney(revenue)} previstos`}
        actions={
          <div className="flex items-center gap-1">
            <LinkButton variant="outline" size="sm" href={`/painel/agenda?data=${addDaysToKey(dateKey, -1)}`} aria-label="Dia anterior">←</LinkButton>
            <LinkButton variant={dateKey === todayKey ? "primary" : "outline"} size="sm" href="/painel/agenda">Hoje</LinkButton>
            <LinkButton variant="outline" size="sm" href={`/painel/agenda?data=${addDaysToKey(dateKey, 1)}`} aria-label="Próximo dia">→</LinkButton>
            <form className="ml-2 flex items-center gap-1">
              <input type="date" name="data" defaultValue={dateKey} className="h-8 rounded-lg border border-stone-300 px-2 text-sm" />
              <Button size="sm" variant="ghost" type="submit">Ir</Button>
            </form>
          </div>
        }
      />
      <Flash ok={sp.ok} erro={sp.erro} />

      {/* Grade do dia */}
      <Card className="overflow-x-auto">
        {columns.length === 0 ? (
          <div className="p-6"><EmptyState title="Cadastre a equipe para usar a agenda"><Link href="/painel/equipe" className="underline">Ir para Equipe</Link></EmptyState></div>
        ) : (
          <div className="min-w-[640px]">
            <div className="sticky top-0 z-10 flex border-b border-stone-200 bg-white">
              <div className="w-14 shrink-0" />
              {columns.map((p) => (
                <div key={p.id} className="flex-1 border-l border-stone-100 px-3 py-3 text-sm font-semibold">
                  {p.name}
                  {p.workingHours.length === 0 && <span className="ml-2 text-xs font-normal text-stone-400">folga</span>}
                </div>
              ))}
            </div>
            <div className="relative flex" style={{ height }}>
              <div className="relative w-14 shrink-0">
                {hours.map((m) => (
                  <span key={m} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-stone-400" style={{ top: (m - startM) * PX }}>
                    {timeOfMinutes(m)}
                  </span>
                ))}
              </div>
              {columns.map((p) => (
                <div key={p.id} className="relative flex-1 border-l border-stone-100 bg-stone-100/70">
                  {/* expediente */}
                  {p.workingHours.map((w) => (
                    <div
                      key={w.id}
                      className="absolute inset-x-0 bg-white"
                      style={{ top: (minutesOf(w.startTime) - startM) * PX, height: (minutesOf(w.endTime) - minutesOf(w.startTime)) * PX }}
                    />
                  ))}
                  {hours.map((m) => (
                    <div key={m} className="absolute inset-x-0 border-t border-stone-100" style={{ top: (m - startM) * PX }} />
                  ))}
                  {/* bloqueios */}
                  {timeOffs
                    .filter((t) => t.professionalId === null || t.professionalId === p.id)
                    .map((t) => (
                      <div
                        key={t.id}
                        className="barber-stripes absolute inset-x-1 rounded-md border border-stone-300 bg-stone-200/80 px-2 py-1 text-[11px] text-stone-600"
                        style={{ top: (minuteOf(t.startsAt) - startM) * PX, height: Math.max(16, (minuteOf(t.endsAt) - minuteOf(t.startsAt)) * PX) }}
                      >
                        {t.reason ?? "Bloqueado"}
                      </div>
                    ))}
                  {/* atendimentos */}
                  {onGrid
                    .filter((a) => a.professionalId === p.id)
                    .map((a) => {
                      const top = (minuteOf(a.startsAt) - startM) * PX;
                      const h = Math.max(22, (minuteOf(a.endsAt) - minuteOf(a.startsAt)) * PX - 2);
                      return (
                        <a
                          key={a.id}
                          href={`#appt-${a.id}`}
                          className={cn("absolute inset-x-1 overflow-hidden rounded-md border px-2 py-1 text-xs shadow-sm hover:z-10 hover:shadow-md", BLOCK_STYLE[a.status])}
                          style={{ top, height: h }}
                        >
                          {a.attendanceConfirmedAt && <span title="Presença confirmada">✓ </span>}<span className="font-semibold tabular-nums">{timeInTz(a.startsAt, tz)}</span> {a.customer.name}
                          {h > 34 && <span className="block truncate opacity-75">{a.service.name}</span>}
                        </a>
                      );
                    })}
                </div>
              ))}
              {nowLine !== null && nowLine > startM && nowLine < endM && (
                <div className="pointer-events-none absolute left-14 right-0 z-20 border-t-2 border-red-500" style={{ top: (nowLine - startM) * PX }}>
                  <span className="absolute -left-1.5 -top-[5px] size-2 rounded-full bg-red-500" />
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Lista com ações */}
        <Card className="lg:col-span-2">
          <h2 className="border-b border-stone-100 px-5 py-4 font-semibold">Atendimentos do dia</h2>
          {appointments.length === 0 ? (
            <div className="p-5"><EmptyState title="Nenhum agendamento neste dia" /></div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {appointments.map((a) => (
                <li key={a.id} id={`appt-${a.id}`} className="scroll-mt-6 px-5 py-4 target:bg-amber-50">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <span className="w-12 font-mono text-sm font-semibold tabular-nums">{timeInTz(a.startsAt, tz)}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/painel/clientes/${a.customerId}`} className="font-medium hover:underline">{a.customer.name}</Link>
                      <span className="ml-2 text-xs text-stone-500">{formatPhone(a.customer.phone)}</span>
                      <p className="text-sm text-stone-500">
                        {a.service.name} · {a.professional.name} · {formatMoney(a.priceCents)}
                        {a.paidCents > 0 && a.status !== "COMPLETED" && <span className="text-emerald-700"> · {formatMoney(a.paidCents)} pago</span>}
                        {a.source === "MANUAL" && <span> · encaixe</span>}
                      </p>
                      {a.notes && <p className="mt-1 text-xs text-stone-500">📝 {a.notes}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                      <AttendanceBadge state={attendanceState(a, shop)} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 pl-16">
                    {(a.status === "CONFIRMED" || a.status === "PENDING_PAYMENT") && (
                      <>
                        <StatusForm id={a.id} status="COMPLETED" label="✓ Concluir" variant="primary" />
                        <StatusForm id={a.id} status="NO_SHOW" label="Faltou" />
                        <form action={setAppointmentStatus}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="status" value="CANCELLED" />
                          <ConfirmSubmit size="sm" variant="ghost" message={`Cancelar o horário de ${a.customer.name}?`}>Cancelar</ConfirmSubmit>
                        </form>
                        {a.status === "CONFIRMED" && a.startsAt > now && !a.attendanceConfirmedAt && (
                          <>
                            {a.reminderSentAt ? (
                              <WhatsAppButton
                                customerId={a.customerId}
                                phone={a.customer.phone}
                                label="Reenviar pedido"
                                logLabel="Pedido de confirmação reenviado"
                                variant="outline"
                                text={messageFor(a, shop)}
                              />
                            ) : (
                              <SendConfirmationButton
                                appointmentId={a.id}
                                waUrl={waLink(a.customer.phone, messageFor(a, shop))}
                                auto={autoWhatsApp}
                                label="Pedir confirmação"
                              />
                            )}
                            <form action={setAttendanceConfirmed}>
                              <input type="hidden" name="id" value={a.id} />
                              <SubmitButton size="sm" variant="ghost" pendingText="…">Marcar presença confirmada</SubmitButton>
                            </form>
                          </>
                        )}
                      </>
                    )}
                    {a.status === "COMPLETED" && (
                      <WhatsAppButton
                        customerId={a.customerId}
                        phone={a.customer.phone}
                        label="Pedir avaliação"
                        logLabel="Pedido de avaliação"
                        variant="outline"
                        text={WHATSAPP_TEMPLATES.avaliacao.build({ customerName: a.customer.name, shopName: shop.name, bookingUrl, reviewUrl: shop.googleMapsUrl })}
                      />
                    )}
                    {(a.status === "COMPLETED" || a.status === "NO_SHOW" || a.status === "CANCELLED") && (
                      <StatusForm id={a.id} status="CONFIRMED" label="Reabrir" variant="ghost" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold">Novo encaixe</h2>
            <p className="mt-1 text-xs text-stone-500">Para clientes que marcaram pelo WhatsApp, telefone ou balcão.</p>
            <form action={createManualAppointment} className="mt-4 space-y-3">
              <input type="hidden" name="date" value={dateKey} />
              <Field label="WhatsApp do cliente"><Input name="phone" type="tel" required placeholder="(11) 98888-7777" /></Field>
              <Field label="Nome" hint="Se o telefone já existir, usamos o cadastro atual."><Input name="name" /></Field>
              <Field label="Serviço">
                <Select name="serviceId" required>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMinutes} min</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Profissional">
                  <Select name="professionalId" required>
                    {professionals.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
                <Field label="Horário"><Input name="time" type="time" required step={300} /></Field>
              </div>
              <Field label="Observação"><Input name="notes" /></Field>
              <SubmitButton className="w-full">Agendar</SubmitButton>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">Bloquear horário</h2>
            <p className="mt-1 text-xs text-stone-500">Almoço, folga, compromisso. Some do agendamento online.</p>
            <form action={createTimeOff} className="mt-4 space-y-3">
              <input type="hidden" name="date" value={dateKey} />
              <Field label="Quem">
                <Select name="professionalId">
                  <option value="">Barbearia inteira</option>
                  {professionals.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="De"><Input name="start" type="time" required defaultValue="12:00" /></Field>
                <Field label="Até"><Input name="end" type="time" required defaultValue="13:00" /></Field>
              </div>
              <Field label="Motivo"><Input name="reason" placeholder="Almoço" /></Field>
              <SubmitButton variant="outline" className="w-full">Bloquear</SubmitButton>
            </form>
            {timeOffs.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-stone-100 pt-4 text-sm">
                {timeOffs.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span>
                      {timeInTz(t.startsAt, tz)}–{timeInTz(t.endsAt, tz)} · {t.professional?.name ?? "Todos"}
                      {t.reason && <span className="text-stone-500"> · {t.reason}</span>}
                    </span>
                    <form action={deleteTimeOff}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="text-xs text-red-600 hover:underline">remover</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function AttendanceBadge({ state }: { state: ReturnType<typeof attendanceState> }) {
  if (!state) return null;
  return <Badge tone={state.tone}>{state.tone === "green" ? "✓ " : state.tone === "amber" ? "⏳ " : ""}{state.label}</Badge>;
}

function StatusForm({ id, status, label, variant = "outline" }: { id: string; status: string; label: string; variant?: "primary" | "outline" | "ghost" }) {
  return (
    <form action={setAppointmentStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton size="sm" variant={variant} pendingText="…">{label}</SubmitButton>
    </form>
  );
}
