import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDuration, formatMoney, STATUS_LABEL } from "@/lib/format";
import { paymentProvider, syncMercadoPagoPayment } from "@/lib/payments";
import { SHOP_SLUG, brandStyle } from "@/lib/shop";
import { formatDate, timeInTz } from "@/lib/time";
import { waLink } from "@/lib/whatsapp";
import { WhatsAppIcon, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Seu agendamento", robots: { index: false } };

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ payment_id?: string; collection_id?: string }>;
};

const gcalDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export default async function AppointmentPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;

  // Retorno do Mercado Pago: sincroniza o status sem depender só do webhook
  const mpId = sp.payment_id ?? sp.collection_id;
  if (mpId && paymentProvider() === "MERCADOPAGO") {
    try {
      await syncMercadoPagoPayment(mpId);
    } catch (e) {
      console.error("[mp] sync no retorno falhou", e);
    }
  }

  let appt = await db.appointment.findUnique({
    where: { publicToken: token },
    include: {
      barbershop: true,
      service: true,
      professional: true,
      customer: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!appt || appt.barbershop.slug !== SHOP_SLUG) notFound();

  // reserva vencida sem pagamento: libera o horário
  if (appt.status === "PENDING_PAYMENT" && appt.holdExpiresAt && appt.holdExpiresAt < new Date()) {
    await db.appointment.update({ where: { id: appt.id }, data: { status: "EXPIRED" } });
    appt = { ...appt, status: "EXPIRED" };
  }

  const shop = appt.barbershop;
  const tz = shop.timezone;
  const payment = appt.payments[0];
  const when = `${formatDate(appt.startsAt, tz, { weekday: "long", day: "2-digit", month: "long" })} às ${timeInTz(appt.startsAt, tz)}`;
  const remaining = Math.max(0, appt.priceCents - appt.paidCents);
  const ok = appt.status === "CONFIRMED" || appt.status === "COMPLETED";

  const gcal = new URL("https://calendar.google.com/calendar/render");
  gcal.searchParams.set("action", "TEMPLATE");
  gcal.searchParams.set("text", `${appt.service.name} — ${shop.name}`);
  gcal.searchParams.set("dates", `${gcalDate(appt.startsAt)}/${gcalDate(appt.endsAt)}`);
  gcal.searchParams.set("details", `Com ${appt.professional.name}`);
  gcal.searchParams.set("location", [shop.address, shop.neighborhood, shop.city].filter(Boolean).join(", "));

  const header = {
    CONFIRMED: { icon: "✓", title: "Horário confirmado!", text: "Te esperamos lá. Chegue com 5 minutos de antecedência." },
    COMPLETED: { icon: "✓", title: "Atendimento concluído", text: "Valeu pela visita!" },
    PENDING_PAYMENT: { icon: "…", title: "Falta pouco!", text: "Conclua o pagamento para garantir seu horário." },
    EXPIRED: { icon: "!", title: "Reserva expirada", text: "O tempo para pagamento acabou e o horário foi liberado." },
    CANCELLED: { icon: "×", title: "Agendamento cancelado", text: "Se quiser, escolha um novo horário." },
    NO_SHOW: { icon: "!", title: "Ausência registrada", text: "Sentimos sua falta. Que tal remarcar?" },
  }[appt.status] ?? { icon: "", title: STATUS_LABEL[appt.status] ?? appt.status, text: "" };

  return (
    <div style={brandStyle(shop.primaryColor)} className="min-h-screen paper px-4 py-10 text-tinta">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="font-display text-xl text-oliva">
          {shop.name}
        </Link>

        <div className="mt-8 text-center">
          <span
            className={cn(
              "mx-auto flex size-16 items-center justify-center rounded-full text-3xl font-semibold",
              ok ? "bg-oliva text-creme" : appt.status === "PENDING_PAYMENT" ? "bg-amber-100 text-amber-800" : "bg-tinta/10 text-tinta/70",
            )}
          >
            {header.icon}
          </span>
          <h1 className="mt-5 font-display text-4xl text-oliva sm:text-5xl">{header.title}</h1>
          <p className="mt-2 text-tinta/60">{header.text}</p>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-tinta/15 bg-white">
          <dl className="divide-y divide-tinta/10 text-sm">
            <Row label="Serviço" value={`${appt.service.name} · ${formatDuration(appt.service.durationMinutes)}`} />
            <Row label="Barbeiro" value={appt.professional.name} />
            <Row label="Quando" value={when} />
            <Row label="Onde" value={[shop.address, shop.neighborhood].filter(Boolean).join(" · ")} />
          </dl>
          <div className="space-y-1.5 bg-oliva/5 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-tinta/60">Valor</span>
              <span>{formatMoney(appt.priceCents)}</span>
            </div>
            {appt.paidCents > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Pago online</span>
                <span>− {formatMoney(appt.paidCents)}</span>
              </div>
            )}
            {ok && (
              <div className="flex justify-between font-medium text-tinta">
                <span>{remaining ? "A pagar na barbearia" : "Tudo pago"}</span>
                <span>{remaining ? formatMoney(remaining) : "✓"}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {appt.status === "PENDING_PAYMENT" && payment?.checkoutUrl && (
            <a href={payment.checkoutUrl} className="rounded-full bg-brand py-3.5 text-center font-semibold text-brand-ink hover:brightness-110">
              Pagar {formatMoney(appt.dueOnlineCents)} agora
            </a>
          )}
          {(appt.status === "EXPIRED" || appt.status === "CANCELLED" || appt.status === "NO_SHOW") && (
            <Link href={`/agendar?servico=${appt.serviceId}`} className="rounded-full bg-brand py-3.5 text-center font-semibold text-brand-ink">
              Escolher novo horário
            </Link>
          )}
          {ok && appt.startsAt > new Date() && (
            <a
              href={gcal.toString()}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-tinta/20 py-3 text-center font-medium text-tinta hover:bg-white"
            >
              Adicionar à minha agenda
            </a>
          )}
          {shop.whatsapp && (
            <a
              href={waLink(shop.whatsapp, `Olá! Sou ${appt.customer.name}, tenho horário ${when} (${appt.service.name}). `)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-tinta/20 py-3 font-medium text-tinta hover:bg-white"
            >
              <WhatsAppIcon /> Falar com a barbearia
            </a>
          )}
          {shop.googleMapsUrl && (
            <a href={shop.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-center text-sm font-semibold text-oliva hover:underline">
              Ver no mapa
            </a>
          )}
        </div>

        {shop.cancellationPolicy && <p className="mt-8 text-center text-xs text-tinta/50">{shop.cancellationPolicy}</p>}
        <p className="mt-6 text-center text-xs text-tinta/40">Guarde este link para consultar seu agendamento.</p>
      </div>
    </div>
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
