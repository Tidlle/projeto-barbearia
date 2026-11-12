import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { confirmationUrl } from "@/lib/confirmations";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/format";
import { whatsappProvider } from "@/lib/messaging";
import { formatDate, timeInTz } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export default async function MessagesPage() {
  const user = await requireUser();
  const shop = user.barbershop;
  const provider = whatsappProvider();
  const messages = await db.messageLog.findMany({
    where: { barbershopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { customer: true, appointment: true },
  });

  return (
    <>
      <PageHeader
        title="Mensagens"
        description={`Pedidos de confirmação de presença enviados pelo WhatsApp ${
          shop.confirmationEnabled ? `${shop.confirmationLeadMinutes / 60 === Math.floor(shop.confirmationLeadMinutes / 60) ? `${shop.confirmationLeadMinutes / 60}h` : `${shop.confirmationLeadMinutes} min`} antes de cada horário.` : "(desativado nas Configurações)."
        }`}
      />

      {provider === "SIMULADO" ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Modo simulado: as mensagens ainda não chegam no WhatsApp do cliente.</p>
          <p className="mt-1">
            Os pedidos são gerados no horário certo e ficam registrados aqui (abra o link para testar como o cliente responde). Para enviar de verdade,
            configure a API oficial do WhatsApp (veja o README). Enquanto isso, use o botão do WhatsApp na Agenda para enviar pelo seu próprio número.
          </p>
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">WhatsApp conectado (API oficial). As mensagens são enviadas automaticamente.</p>
        </div>
      )}

      <Card className="overflow-x-auto">
        {messages.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Nenhuma mensagem enviada ainda">
              Os pedidos saem sozinhos {shop.confirmationLeadMinutes} minutos antes de cada horário. Para testar agora, use “Pedir confirmação agora” na Agenda.
            </EmptyState>
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">Enviada</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Mensagem</th>
                <th className="px-4 py-3 font-medium">Resposta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 align-top">
              {messages.map((m) => {
                const a = m.appointment;
                const answer = !a
                  ? null
                  : a.status === "CANCELLED"
                    ? { tone: "red" as const, label: "Não vai — horário liberado" }
                    : a.attendanceConfirmedAt
                      ? { tone: "green" as const, label: "✓ Confirmou presença" }
                      : a.startsAt < new Date()
                        ? { tone: "stone" as const, label: "Sem resposta" }
                        : { tone: "amber" as const, label: "Aguardando" };
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {formatDate(m.createdAt, shop.timezone, { day: "2-digit", month: "2-digit" })} {timeInTz(m.createdAt, shop.timezone)}
                      <div className="mt-1 flex gap-1">
                        <Badge tone={m.status === "SENT" ? "blue" : "red"}>{m.status === "SENT" ? "Enviada" : "Falhou"}</Badge>
                        {m.provider === "SIMULADO" && <Badge>Simulada</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/painel/clientes/${m.customerId}`} className="font-medium hover:underline">{m.customer.name}</Link>
                      <p className="text-xs text-stone-500">{formatPhone(m.to)}</p>
                    </td>
                    <td className="max-w-md px-4 py-3 text-stone-600">
                      {m.body}
                      {m.error && <p className="mt-1 text-xs text-red-600">Erro: {m.error}</p>}
                      {a && (
                        <a href={confirmationUrl(a.publicToken)} target="_blank" className="mt-1 block text-xs font-medium text-oliva hover:underline">
                          Abrir link de confirmação ↗
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">{answer && <Badge tone={answer.tone}>{answer.label}</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
