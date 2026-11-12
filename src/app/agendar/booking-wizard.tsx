"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { WhatsAppIcon, cn } from "@/components/ui";
import { computeDueOnline, formatDuration, formatMoney } from "@/lib/format";
import { WEEKDAYS_SHORT, addDaysToKey, formatDate, formatDateKey, timeInTz, weekdayOf } from "@/lib/time";
import { captureLead, createBooking } from "./actions";

type Service = { id: string; name: string; description: string | null; category: string | null; durationMinutes: number; priceCents: number };
type Pro = { id: string; name: string; role: string; serviceIds: string[]; weekdays: number[] };
type Step = "servico" | "profissional" | "horario" | "dados" | "revisao";
type Contact = { name: string; phone: string; email: string; birthday: string; consent: boolean };

const STEPS: { id: Step; label: string }[] = [
  { id: "servico", label: "Serviço" },
  { id: "profissional", label: "Barbeiro" },
  { id: "horario", label: "Horário" },
  { id: "dados", label: "Seus dados" },
  { id: "revisao", label: "Confirmar" },
];
const STORAGE_KEY = "zer0nze:contato";

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function BookingWizard(props: {
  shopName: string;
  timezone: string;
  todayKey: string;
  /** primeiro dia sugerido (amanhã, se o expediente de hoje já acabou) */
  firstDateKey: string;
  maxAdvanceDays: number;
  paymentMode: string;
  depositPercent: number;
  holdMinutes: number;
  /** antecedência do pedido de confirmação por WhatsApp (null = desativado) */
  confirmationLeadMinutes: number | null;
  cancellationPolicy: string | null;
  services: Service[];
  professionals: Pro[];
  initialServiceId?: string;
  initialProfessionalId?: string;
  source?: string;
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState<string | undefined>(props.initialServiceId);
  const [proId, setProId] = useState<string | null | undefined>(props.initialProfessionalId);
  const [step, setStep] = useState<Step>(
    props.initialServiceId ? (props.initialProfessionalId ? "horario" : "profissional") : "servico",
  );
  const [pickedDate, setDateKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ time: string; startsAt: string } | null>(null);
  const [fetched, setFetched] = useState<{ key: string; slots: { time: string; startsAt: string }[] } | null>(null);
  const [refresh, setRefresh] = useState(0);
  // dados salvos de um agendamento anterior neste aparelho (o formulário só aparece
  // depois da 1ª etapa, então não há diferença entre o HTML do servidor e o do navegador)
  const [contact, setContact] = useState<Contact>(() => {
    const empty = { name: "", phone: "", email: "", birthday: "", consent: true };
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      return saved ? { ...empty, ...JSON.parse(saved) } : empty;
    } catch {
      return empty;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const service = props.services.find((s) => s.id === serviceId);
  const pro = props.professionals.find((p) => p.id === proId);
  const eligiblePros = props.professionals.filter((p) => !serviceId || p.serviceIds.includes(serviceId));
  const visibleServices = props.initialProfessionalId && proId
    ? props.services.filter((s) => props.professionals.find((p) => p.id === proId)?.serviceIds.includes(s.id))
    : props.services;

  // dias da semana em que alguém elegível atende
  const workingWeekdays = useMemo(() => {
    const list = proId ? eligiblePros.filter((p) => p.id === proId) : eligiblePros;
    return new Set(list.flatMap((p) => p.weekdays));
  }, [eligiblePros, proId]);

  const days = useMemo(
    () => Array.from({ length: props.maxAdvanceDays + 1 }, (_, i) => addDaysToKey(props.todayKey, i)),
    [props.maxAdvanceDays, props.todayKey],
  );

  // sem dia escolhido, usa o primeiro dia em que alguém atende
  const dateKey =
    pickedDate && workingWeekdays.has(weekdayOf(pickedDate))
      ? pickedDate
      : (days.find((d) => d >= props.firstDateKey && workingWeekdays.has(weekdayOf(d))) ?? null);

  // a URL de busca é a chave: quando muda, buscamos de novo; enquanto não chega, está carregando
  const slotsKey =
    serviceId && dateKey && step === "horario"
      ? `/api/horarios?${new URLSearchParams({ servico: serviceId, data: dateKey, ...(proId ? { profissional: proId } : {}) })}#${refresh}`
      : null;
  const slots = fetched && fetched.key === slotsKey ? fetched.slots : null;
  const loadingSlots = !!slotsKey && slots === null;

  useEffect(() => {
    if (!slotsKey) return;
    const ctrl = new AbortController();
    fetch(slotsKey.split("#")[0], { signal: ctrl.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setFetched({ key: slotsKey, slots: d.slots ?? [] }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [slotsKey]);

  const due = service ? computeDueOnline(service.priceCents, props.paymentMode, props.depositPercent) : 0;
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  function go(to: Step) {
    setError(null);
    setStep(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    const prev: Record<Step, Step | null> = {
      servico: null,
      profissional: "servico",
      horario: props.initialProfessionalId ? "servico" : "profissional",
      dados: "horario",
      revisao: "dados",
    };
    const p = prev[step];
    if (p) go(p);
    else router.push("/");
  }

  function submitContact(e: React.FormEvent) {
    e.preventDefault();
    if (contact.name.trim().length < 2) return setError("Informe seu nome.");
    if (contact.phone.replace(/\D/g, "").length < 10) return setError("Informe seu WhatsApp com DDD.");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: contact.name, phone: contact.phone, email: contact.email, birthday: contact.birthday }));
    } catch {}
    startTransition(async () => {
      const r = await captureLead({ contact, serviceId: serviceId!, startsAt: slot?.startsAt, source: props.source });
      if (!r.ok) return setError(r.error);
      go("revisao");
    });
  }

  function confirm() {
    startTransition(async () => {
      const r = await createBooking({
        serviceId: serviceId!,
        professionalId: proId ?? null,
        startsAt: slot!.startsAt,
        contact,
        source: props.source,
      });
      if (r.ok) {
        window.location.href = r.redirectTo;
        return;
      }
      if (r.code === "SLOT_TAKEN") {
        setSlot(null);
        setRefresh((n) => n + 1);
        setStep("horario");
      }
      setError(r.error);
    });
  }

  const periods = slots
    ? [
        { label: "Manhã", items: slots.filter((s) => s.time < "12:00") },
        { label: "Tarde", items: slots.filter((s) => s.time >= "12:00" && s.time < "18:00") },
        { label: "Noite", items: slots.filter((s) => s.time >= "18:00") },
      ].filter((p) => p.items.length)
    : [];

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4">
      {/* Cabeçalho */}
      <header className="flex h-16 items-center justify-between">
        <button onClick={back} className="-ml-2 rounded-lg px-2 py-1 text-sm text-tinta/60 hover:text-tinta">
          ← Voltar
        </button>
        <Link href="/" className="font-display text-xl text-oliva">
          {props.shopName}
        </Link>
        <span className="w-14" />
      </header>

      {/* Progresso */}
      <div className="mb-8 flex gap-1.5" aria-label={`Etapa ${stepIndex + 1} de ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex-1">
            <div className={cn("h-1 rounded-full", i <= stepIndex ? "bg-oliva" : "bg-tinta/10")} />
            <p className={cn("mt-2 hidden text-[11px] sm:block", i === stepIndex ? "text-tinta" : "text-tinta/50")}>{s.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <main key={step} className="animate-fade-up flex-1 pb-36">
        {step === "servico" && (
          <section>
            <StepTitle title="Escolha o serviço" />
            <div className="space-y-2">
              {visibleServices.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setServiceId(s.id);
                    setSlot(null);
                    if (proId && !props.professionals.find((p) => p.id === proId)?.serviceIds.includes(s.id)) setProId(undefined);
                    go(props.initialProfessionalId && proId ? "horario" : "profissional");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition",
                    s.id === serviceId ? "border-oliva bg-white ring-2 ring-oliva" : "border-tinta/15 bg-white hover:border-oliva/60",
                  )}
                >
                  <span>
                    <span className="block font-slab text-lg font-semibold text-tinta">{s.name}</span>
                    {s.description && <span className="mt-0.5 block text-sm text-tinta/60">{s.description}</span>}
                    <span className="mt-1 block text-xs text-tinta/50">{formatDuration(s.durationMinutes)}</span>
                  </span>
                  <span className="shrink-0 font-display text-2xl text-oliva">{formatMoney(s.priceCents)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === "profissional" && (
          <section>
            <StepTitle title="Com quem?" subtitle={service?.name} />
            <div className="grid grid-cols-2 gap-3">
              <ProCard
                name="Sem preferência"
                role="Primeiro horário livre"
                selected={proId === null}
                onClick={() => {
                  setProId(null);
                  setSlot(null);
                  go("horario");
                }}
                icon="✦"
              />
              {eligiblePros.map((p) => (
                <ProCard
                  key={p.id}
                  name={p.name}
                  role={p.role}
                  selected={proId === p.id}
                  onClick={() => {
                    setProId(p.id);
                    setSlot(null);
                    go("horario");
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {step === "horario" && (
          <section>
            <StepTitle title="Escolha o dia e horário" subtitle={`${service?.name} · ${pro?.name ?? "Sem preferência"}`} />
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
              {days.map((d) => {
                const open = workingWeekdays.has(weekdayOf(d));
                const active = d === dateKey;
                return (
                  <button
                    key={d}
                    disabled={!open}
                    onClick={() => {
                      setDateKey(d);
                      setSlot(null);
                    }}
                    className={cn(
                      "flex w-16 shrink-0 flex-col items-center rounded-2xl border py-3 transition",
                      active ? "border-oliva bg-oliva text-creme" : "border-tinta/15 hover:border-oliva/60",
                      !open && "cursor-not-allowed opacity-30",
                    )}
                  >
                    <span className="text-[11px] uppercase">{d === props.todayKey ? "Hoje" : WEEKDAYS_SHORT[weekdayOf(d)]}</span>
                    <span className="font-display text-2xl leading-tight">{d.slice(8, 10)}</span>
                    <span className="text-[10px] uppercase opacity-70">{formatDateKey(d, { month: "short" }).replace(".", "")}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6">
              {loadingSlots && <p className="py-10 text-center text-sm text-tinta/50">Buscando horários…</p>}
              {!loadingSlots && slots && slots.length === 0 && (
                <p className="rounded-2xl border border-dashed border-tinta/15 py-10 text-center text-sm text-tinta/60">
                  Sem horários livres neste dia. Tente outro dia{proId ? " ou outro barbeiro" : ""}.
                </p>
              )}
              {periods.map((p) => (
                <div key={p.label} className="mb-6">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-tinta/50">{p.label}</p>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {p.items.map((s) => (
                      <button
                        key={s.startsAt}
                        onClick={() => setSlot(s)}
                        className={cn(
                          "rounded-xl border py-2.5 text-sm font-medium tabular-nums transition",
                          slot?.startsAt === s.startsAt ? "border-oliva bg-oliva text-creme" : "border-tinta/15 text-tinta hover:border-oliva/60",
                        )}
                      >
                        {s.time}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {step === "dados" && (
          <section>
            <StepTitle title="Seus dados" subtitle="Usamos seu WhatsApp para confirmar e lembrar do horário." />
            <form id="contact-form" onSubmit={submitContact} className="space-y-4">
              <DarkField label="Nome completo">
                <input
                  required
                  autoComplete="name"
                  value={contact.name}
                  onChange={(e) => setContact({ ...contact, name: e.target.value })}
                  className={darkInput}
                  placeholder="Como devemos te chamar?"
                />
              </DarkField>
              <DarkField label="WhatsApp">
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: maskPhone(e.target.value) })}
                  className={darkInput}
                  placeholder="(11) 98888-7777"
                />
              </DarkField>
              <div className="grid gap-4 sm:grid-cols-2">
                <DarkField label="E-mail (opcional)">
                  <input
                    type="email"
                    autoComplete="email"
                    value={contact.email}
                    onChange={(e) => setContact({ ...contact, email: e.target.value })}
                    className={darkInput}
                  />
                </DarkField>
                <DarkField label="Aniversário (opcional)">
                  <input
                    type="date"
                    value={contact.birthday}
                    onChange={(e) => setContact({ ...contact, birthday: e.target.value })}
                    className={cn(darkInput)}
                  />
                </DarkField>
              </div>
              <label className="flex items-start gap-3 text-sm text-tinta/60">
                <input
                  type="checkbox"
                  checked={contact.consent}
                  onChange={(e) => setContact({ ...contact, consent: e.target.checked })}
                  className="mt-0.5 size-4 accent-[var(--oliva)]"
                />
                Quero receber lembretes, novidades e ofertas da {props.shopName} pelo WhatsApp. Posso sair quando quiser.
              </label>
            </form>
          </section>
        )}

        {step === "revisao" && service && slot && (
          <section>
            <StepTitle title="Confira e confirme" />
            <div className="overflow-hidden rounded-2xl border border-tinta/15">
              <dl className="divide-y divide-tinta/10 text-sm">
                <Row label="Serviço" value={`${service.name} · ${formatDuration(service.durationMinutes)}`} />
                <Row label="Barbeiro" value={pro?.name ?? "Sem preferência (primeiro livre)"} />
                <Row
                  label="Quando"
                  value={`${formatDate(new Date(slot.startsAt), props.timezone, { weekday: "long", day: "2-digit", month: "long" })} às ${timeInTz(new Date(slot.startsAt), props.timezone)}`}
                />
                <Row label="Cliente" value={`${contact.name} · ${contact.phone}`} />
              </dl>
              <div className="space-y-2 bg-oliva/5 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-tinta/60">Valor do serviço</span>
                  <span className="text-tinta">{formatMoney(service.priceCents)}</span>
                </div>
                {due > 0 && (
                  <>
                    <div className="flex justify-between font-medium">
                      <span className="text-tinta">{props.paymentMode === "FULL" ? "Pagar agora" : `Sinal agora (${props.depositPercent}%)`}</span>
                      <span className="text-oliva">{formatMoney(due)}</span>
                    </div>
                    {due < service.priceCents && (
                      <div className="flex justify-between">
                        <span className="text-tinta/60">Restante na barbearia</span>
                        <span className="text-tinta/70">{formatMoney(service.priceCents - due)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {due > 0 && (
              <p className="mt-4 text-sm text-tinta/60">
                Pague por <strong className="text-tinta">Pix ou cartão</strong>. Seu horário fica reservado por {props.holdMinutes} minutos
                enquanto você conclui o pagamento.
              </p>
            )}
            {due === 0 && (
              <div className="mt-4 flex gap-3 rounded-2xl bg-white p-4 text-sm ring-1 ring-tinta/10">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15 text-[#128C4B]">
                  <WhatsAppIcon />
                </span>
                <p className="text-tinta/70">
                  <strong className="text-tinta">Sem pagamento antecipado</strong> — você paga na barbearia.
                  {props.confirmationLeadMinutes
                    ? ` ${formatLead(props.confirmationLeadMinutes)} antes do horário, a gente te manda uma mensagem no WhatsApp para você confirmar presença.`
                    : ""}
                </p>
              </div>
            )}
            {props.cancellationPolicy && <p className="mt-3 text-xs text-tinta/50">{props.cancellationPolicy}</p>}
          </section>
        )}
      </main>

      {/* Barra inferior */}
      {(step === "horario" || step === "dados" || step === "revisao") && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-tinta/15 bg-creme/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 text-sm">
              <p className="truncate text-tinta">{service?.name}</p>
              <p className="truncate text-tinta/60">
                {slot
                  ? `${formatDate(new Date(slot.startsAt), props.timezone, { weekday: "short", day: "2-digit", month: "2-digit" })} · ${slot.time}`
                  : "Selecione um horário"}
              </p>
            </div>
            {step === "horario" && (
              <button disabled={!slot} onClick={() => go("dados")} className={primaryBtn}>
                Continuar
              </button>
            )}
            {step === "dados" && (
              <button type="submit" form="contact-form" disabled={pending} className={primaryBtn}>
                {pending ? "Aguarde…" : "Continuar"}
              </button>
            )}
            {step === "revisao" && (
              <button onClick={confirm} disabled={pending} className={primaryBtn}>
                {pending ? "Processando…" : due > 0 ? `Pagar ${formatMoney(due)}` : "Confirmar agendamento"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatLead(minutes: number) {
  if (minutes % 60 === 0) return minutes === 60 ? "1 hora" : `${minutes / 60} horas`;
  return `${minutes} minutos`;
}

const primaryBtn =
  "shrink-0 rounded-full bg-brand px-6 py-3 font-slab text-sm font-bold uppercase tracking-wider text-brand-ink transition hover:brightness-110 disabled:opacity-40";
const darkInput =
  "h-12 w-full rounded-xl border border-tinta/15 bg-white px-4 text-tinta placeholder:text-tinta/40 focus:border-oliva focus:ring-2 focus:ring-oliva/20 focus:outline-none";

function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-3xl text-oliva sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-tinta/60">{subtitle}</p>}
    </div>
  );
}

function ProCard({ name, role, selected, onClick, icon }: { name: string; role: string; selected: boolean; onClick: () => void; icon?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left transition",
        selected ? "border-oliva bg-white ring-2 ring-oliva" : "border-tinta/15 bg-white hover:border-oliva/60",
      )}
    >
      <span className="barber-stripes mb-3 flex size-14 items-center justify-center rounded-full bg-oliva font-display text-3xl text-creme">
        {icon ?? name.slice(0, 1)}
      </span>
      <span className="block font-medium text-tinta">{name}</span>
      <span className="block text-xs text-tinta/60">{role}</span>
    </button>
  );
}

function DarkField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-tinta/70">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3">
      <dt className="text-tinta/60">{label}</dt>
      <dd className="text-right text-tinta first-letter:uppercase">{value}</dd>
    </div>
  );
}
