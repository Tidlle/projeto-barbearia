import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getConfirmationQueue, type QueueItem } from "@/lib/confirmations";
import { formatPhone } from "@/lib/format";
import { whatsappProvider } from "@/lib/messaging";
import { timeInTz } from "@/lib/time";
import { SendConfirmationButton } from "@/components/confirmation-buttons";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AlertsToggle, QueueRunner, type QueueRow } from "./queue-runner";

export const dynamic = "force-dynamic";

export default async function ConfirmationsPage() {
  const user = await requireUser();
  const shop = user.barbershop;
  const tz = shop.timezone;
  const auto = whatsappProvider() === "META";
  const queue = await getConfirmationQueue(shop);

  const toRow = (i: QueueItem): QueueRow => ({
    id: i.appointment.id,
    customerId: i.appointment.customerId,
    customerName: i.appointment.customer.name,
    phone: formatPhone(i.appointment.customer.phone),
    when: i.message.match(/ é (.+?) \(/)?.[1] ?? timeInTz(i.appointment.startsAt, tz),
    service: `${i.appointment.service.name} com ${i.appointment.professional.name}`,
    late: i.late,
    message: i.message,
    waUrl: i.waUrl,
  });

  const lead = shop.confirmationLeadMinutes;
  const leadLabel = lead % 60 === 0 ? `${lead / 60}h` : `${lead} min`;

  return (
    <>
      <PageHeader
        title="Confirmações"
        description={
          shop.confirmationEnabled
            ? `Cada horário entra na fila ${leadLabel} antes${shop.confirmationBatchMinutes ? `, em rodadas a cada ${shop.confirmationBatchMinutes} min` : ""}. ${
                auto ? "O envio é automático (API oficial do WhatsApp)." : "Você envia pelo WhatsApp da barbearia, um toque por cliente."
              }`
            : "A confirmação de presença está desligada nas Configurações."
        }
        actions={<AlertsToggle />}
      />

      {!shop.confirmationEnabled ? (
        <Card className="p-6 text-sm">
          <Link href="/painel/configuracoes" className="text-oliva underline">Ligar a confirmação de presença</Link>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <QueueRunner items={queue.ready.map(toRow)} auto={auto} />

            {queue.lastMinute.length > 0 && (
              <Card className="mt-6">
                <div className="border-b border-stone-100 px-5 py-3">
                  <p className="text-sm font-semibold">Marcaram em cima da hora</p>
                  <p className="text-xs text-stone-500">Agendaram com menos de {leadLabel} de antecedência. O envio é opcional.</p>
                </div>
                <ul className="divide-y divide-stone-100">
                  {queue.lastMinute.map((i) => (
                    <li key={i.appointment.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{i.appointment.customer.name}</span>{" "}
                        <span className="text-stone-500">· {timeInTz(i.appointment.startsAt, tz)} · {i.appointment.service.name}</span>
                      </span>
                      <SendConfirmationButton appointmentId={i.appointment.id} waUrl={i.waUrl} auto={auto} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <p className="border-b border-stone-100 px-5 py-3 text-sm font-semibold">Ainda hoje</p>
              {queue.upcoming.length === 0 ? (
                <p className="px-5 py-4 text-sm text-stone-500">Nenhum outro horário para entrar na fila hoje.</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {queue.upcoming.map((i) => (
                    <li key={i.appointment.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-mono tabular-nums">{timeInTz(i.appointment.startsAt, tz)}</span> {i.appointment.customer.name}
                      </span>
                      <span className="shrink-0 text-xs text-stone-500">entra às {timeInTz(i.releaseAt, tz)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <p className="border-b border-stone-100 px-5 py-3 text-sm font-semibold">Enviados hoje</p>
              {queue.sent.length === 0 ? (
                <p className="px-5 py-4 text-sm text-stone-500">Nenhum pedido enviado hoje.</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {queue.sent.map((a) => {
                    const answer =
                      a.status === "CANCELLED"
                        ? { tone: "red" as const, label: "Não vai" }
                        : a.attendanceConfirmedAt
                          ? { tone: "green" as const, label: "✓ Confirmou" }
                          : a.startsAt < new Date()
                            ? { tone: "stone" as const, label: "Sem resposta" }
                            : { tone: "amber" as const, label: "Aguardando" };
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                        <Link href={`/painel/clientes/${a.customerId}`} className="min-w-0 truncate hover:underline">
                          <span className="font-mono tabular-nums">{timeInTz(a.startsAt, tz)}</span> {a.customer.name}
                        </Link>
                        <Badge tone={answer.tone}>{answer.label}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
