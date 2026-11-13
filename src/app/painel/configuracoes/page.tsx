import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/format";
import { whatsappProvider } from "@/lib/messaging";
import { paymentProvider } from "@/lib/payments";
import { saveSettings } from "../actions";
import { Flash, HoursEditor } from "@/components/painel";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

type Props = { searchParams: Promise<{ ok?: string; erro?: string }> };

const LEAD_OPTIONS = [
  { minutes: 1440, label: "24 horas antes" },
  { minutes: 180, label: "3 horas antes" },
  { minutes: 120, label: "2 horas antes" },
  { minutes: 60, label: "1 hora antes" },
];

export default async function SettingsPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = await searchParams;
  const shop = await db.barbershop.findUniqueOrThrow({ where: { id: user.barbershopId }, include: { businessHours: true } });
  const provider = paymentProvider();
  const whatsapp = whatsappProvider();

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Dados do site, regras de agendamento e pagamento."
        actions={<Link href="/" target="_blank" className="text-sm text-stone-600 hover:underline">Ver site ↗</Link>}
      />
      <Flash ok={sp.ok} erro={sp.erro} />

      <form action={saveSettings} className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Barbearia</h2>
          <Field label="Nome"><Input name="name" required defaultValue={shop.name} /></Field>
          <Field label="Frase de destaque"><Input name="tagline" defaultValue={shop.tagline ?? ""} /></Field>
          <Field label="Descrição"><Textarea name="description" rows={3} defaultValue={shop.description ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Endereço"><Input name="address" defaultValue={shop.address ?? ""} /></Field>
            <Field label="Bairro"><Input name="neighborhood" defaultValue={shop.neighborhood ?? ""} /></Field>
          </div>
          <Field label="Cidade"><Input name="city" defaultValue={shop.city ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="WhatsApp"><Input name="whatsapp" type="tel" defaultValue={formatPhone(shop.whatsapp)} /></Field>
            <Field label="Telefone"><Input name="phone" type="tel" defaultValue={formatPhone(shop.phone)} /></Field>
          </div>
          <Field label="Instagram"><Input name="instagram" defaultValue={shop.instagram ?? ""} placeholder="@suabarbearia" /></Field>
          <Field label="Link do Google Maps" hint="Usado em “Como chegar” e no pedido de avaliação.">
            <Input name="googleMapsUrl" type="url" defaultValue={shop.googleMapsUrl ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nota no Google"><Input name="googleRating" inputMode="decimal" defaultValue={shop.googleRating?.toString().replace(".", ",") ?? ""} /></Field>
            <Field label="Nº de avaliações"><Input name="googleReviewCount" type="number" defaultValue={shop.googleReviewCount ?? ""} /></Field>
          </div>
          <Field label="Comodidades" hint="Separe por vírgula."><Input name="amenities" defaultValue={shop.amenities.join(", ")} /></Field>
          <Field label="Cor da marca"><Input name="primaryColor" type="color" defaultValue={shop.primaryColor} className="h-10 w-24 p-1" /></Field>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Confirmação de presença</h2>
              <Badge tone={whatsapp === "META" ? "green" : "amber"}>
                {whatsapp === "META" ? "Envio automático (API)" : "Envio assistido"}
              </Badge>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirmationEnabled" defaultChecked={shop.confirmationEnabled} className="mt-0.5 size-4 accent-[var(--oliva)]" />
              <span>
                Enviar pelo WhatsApp um pedido para o cliente confirmar presença
                <span className="block text-xs text-stone-500">
                  O cliente toca no link e responde “Confirmo” ou “Não vou conseguir ir” (o horário é liberado na hora).
                </span>
              </span>
            </label>
            <Field label="Enviar o pedido de confirmação" hint="Padrão: 2 horas antes.">
              <Select name="confirmationLeadMinutes" defaultValue={String(shop.confirmationLeadMinutes)}>
                {LEAD_OPTIONS.map((o) => (
                  <option key={o.minutes} value={o.minutes}>
                    {o.label}
                  </option>
                ))}
                {!LEAD_OPTIONS.some((o) => o.minutes === shop.confirmationLeadMinutes) && (
                  <option value={shop.confirmationLeadMinutes}>{shop.confirmationLeadMinutes} minutos antes (atual)</option>
                )}
              </Select>
            </Field>
            <Field label="Como os pedidos entram na fila" hint="Em rodadas, a equipe envia vários de uma vez em vez de parar toda hora (o pedido pode sair até 1 rodada mais cedo).">
              <Select name="confirmationBatchMinutes" defaultValue={String(shop.confirmationBatchMinutes)}>
                <option value="0">Na hora exata de cada horário</option>
                <option value="30">Em rodadas a cada 30 minutos</option>
                <option value="60">Em rodadas a cada 1 hora</option>
              </Select>
            </Field>
            <Link href="/painel/confirmacoes" className="text-sm text-oliva hover:underline">Abrir a fila de confirmações →</Link>
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Pagamento online</h2>
              <Badge tone={provider === "MERCADOPAGO" ? "green" : "amber"}>
                {provider === "MERCADOPAGO" ? "Mercado Pago conectado" : "Modo simulado (teste)"}
              </Badge>
            </div>
            <Field label="Política">
              <Select name="paymentMode" defaultValue={shop.paymentMode}>
                <option value="NONE">Sem pagamento online (cliente paga na barbearia)</option>
                <option value="DEPOSIT">Sinal antecipado</option>
                <option value="FULL">Pagamento total antecipado</option>
              </Select>
            </Field>
            <Field label="Sinal (% do valor)" hint="Só vale se a política for “Sinal antecipado”.">
              <Input name="depositPercent" type="number" min={5} max={100} defaultValue={shop.depositPercent} />
            </Field>
            <Field label="Política de cancelamento (aparece para o cliente)">
              <Textarea name="cancellationPolicy" rows={3} defaultValue={shop.cancellationPolicy ?? ""} />
            </Field>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-semibold">Regras da agenda</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Intervalo entre horários (min)"><Input name="slotIntervalMinutes" type="number" min={5} step={5} defaultValue={shop.slotIntervalMinutes} /></Field>
              <Field label="Antecedência mínima (min)"><Input name="minAdvanceMinutes" type="number" min={0} defaultValue={shop.minAdvanceMinutes} /></Field>
              <Field label="Agenda aberta por (dias)"><Input name="maxAdvanceDays" type="number" min={1} defaultValue={shop.maxAdvanceDays} /></Field>
              <Field label="Reserva aguardando pagamento (min)"><Input name="holdMinutes" type="number" min={5} defaultValue={shop.holdMinutes} /></Field>
            </div>
            <Field label="Cliente “sumido” depois de (dias sem vir)">
              <Input name="inactiveAfterDays" type="number" min={7} defaultValue={shop.inactiveAfterDays} />
            </Field>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Horário de funcionamento (exibido no site)</h2>
            <HoursEditor hours={shop.businessHours.map((h) => ({ weekday: h.weekday, start: h.openTime, end: h.closeTime }))} />
            <p className="text-xs text-stone-500">Os horários disponíveis para agendar vêm da escala de cada profissional (Equipe).</p>
          </Card>

          <SubmitButton size="lg" className="w-full">Salvar configurações</SubmitButton>
        </div>
      </form>
    </>
  );
}
