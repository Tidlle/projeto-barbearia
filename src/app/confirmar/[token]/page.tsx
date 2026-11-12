import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { whenLabel } from "@/lib/confirmations";
import { db } from "@/lib/db";
import { formatDuration, formatMoney } from "@/lib/format";
import { SHOP_SLUG, brandStyle } from "@/lib/shop";
import { waLink } from "@/lib/whatsapp";
import { SubmitButton } from "@/components/submit-button";
import { WhatsAppIcon, cn } from "@/components/ui";
import { confirmAttendance, declineAttendance } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirmar presença", robots: { index: false } };

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const appt = await db.appointment.findUnique({
    where: { publicToken: token },
    include: { barbershop: true, service: true, professional: true, customer: true },
  });
  if (!appt || appt.barbershop.slug !== SHOP_SLUG) notFound();

  const shop = appt.barbershop;
  const now = new Date();
  const when = whenLabel(appt.startsAt, shop.timezone, now);
  const canAnswer = appt.status === "CONFIRMED" && appt.startsAt > now;
  const confirmed = !!appt.attendanceConfirmedAt && appt.status === "CONFIRMED";
  const cancelled = appt.status === "CANCELLED";

  const state = cancelled
    ? { icon: "×", title: "Horário liberado", text: "Valeu por avisar! Assim outro cliente pode usar o horário.", tone: "bg-tinta/10 text-tinta/70" }
    : confirmed
      ? { icon: "✓", title: "Presença confirmada!", text: `Te esperamos ${when}. Chegue com uns 5 minutinhos de antecedência.`, tone: "bg-oliva text-creme" }
      : canAnswer
        ? { icon: "?", title: "Você confirma presença?", text: `Seu horário é ${when}.`, tone: "bg-brand text-brand-ink" }
        : { icon: "•", title: "Este horário já passou", text: "Se quiser, escolha um novo horário.", tone: "bg-tinta/10 text-tinta/70" };

  return (
    <div style={brandStyle(shop.primaryColor)} className="paper min-h-screen px-4 py-10 text-tinta">
      <div className="mx-auto max-w-md">
        <Link href="/" className="font-display text-xl text-oliva">
          {shop.name}
        </Link>

        <div className="mt-8 text-center">
          <span className={cn("mx-auto flex size-16 items-center justify-center rounded-full text-3xl font-semibold", state.tone)}>{state.icon}</span>
          <h1 className="mt-5 font-display text-4xl text-oliva">{state.title}</h1>
          <p className="mt-2 text-tinta/70">
            {canAnswer && !confirmed ? <>Olá, {appt.customer.name.split(" ")[0]}! </> : null}
            {state.text}
          </p>
        </div>

        <dl className="mt-8 divide-y divide-tinta/10 overflow-hidden rounded-2xl bg-white text-sm ring-1 ring-tinta/10">
          <Row label="Serviço" value={`${appt.service.name} · ${formatDuration(appt.service.durationMinutes)}`} />
          <Row label="Barbeiro" value={appt.professional.name} />
          <Row label="Quando" value={when} />
          <Row label="Onde" value={[shop.address, shop.neighborhood].filter(Boolean).join(" · ")} />
          <Row label="Valor" value={`${formatMoney(appt.priceCents)} (pago na barbearia)`} />
        </dl>

        <div className="mt-6 flex flex-col gap-3">
          {canAnswer && !confirmed && (
            <>
              <form action={confirmAttendance}>
                <input type="hidden" name="token" value={token} />
                <SubmitButton size="lg" className="w-full rounded-full font-slab uppercase tracking-wider" pendingText="Confirmando…">
                  ✓ Confirmo, estarei lá
                </SubmitButton>
              </form>
              <form action={declineAttendance}>
                <input type="hidden" name="token" value={token} />
                <SubmitButton variant="outline" size="lg" className="w-full rounded-full" pendingText="Liberando horário…">
                  Não vou conseguir ir
                </SubmitButton>
              </form>
            </>
          )}
          {confirmed && canAnswer && (
            <form action={declineAttendance}>
              <input type="hidden" name="token" value={token} />
              <button className="w-full text-sm text-tinta/50 underline hover:text-tinta">Surgiu um imprevisto? Liberar meu horário</button>
            </form>
          )}
          {(cancelled || !canAnswer) && (
            <Link href={`/agendar?servico=${appt.serviceId}`} className="rounded-full bg-oliva py-3.5 text-center font-slab font-bold uppercase tracking-wider text-creme">
              Escolher novo horário
            </Link>
          )}
          {shop.whatsapp && (
            <a
              href={waLink(shop.whatsapp, `Olá! Sou ${appt.customer.name}, tenho horário ${when} (${appt.service.name}). `)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-tinta/20 py-3 font-medium hover:bg-white"
            >
              <WhatsAppIcon /> Falar com a barbearia
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3">
      <dt className="text-tinta/60">{label}</dt>
      <dd className="text-right first-letter:uppercase">{value}</dd>
    </div>
  );
}
