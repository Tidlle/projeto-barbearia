import "server-only";

/**
 * Envio de WhatsApp.
 * - META: API oficial (WhatsApp Cloud API). Mensagens iniciadas pela empresa precisam de um
 *   modelo (template) aprovado pela Meta — ver README.
 * - SIMULADO: sem credenciais, nada sai do servidor; a mensagem fica registrada no painel
 *   (Mensagens) para testes.
 */
export type WhatsAppProvider = "META" | "SIMULADO";

export function whatsappProvider(): WhatsAppProvider {
  return process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? "META" : "SIMULADO";
}

export type SendResult = { provider: WhatsAppProvider; ok: boolean; externalId?: string; error?: string };

/**
 * Pedido de confirmação de presença.
 * Template sugerido (categoria "Utilidade", idioma pt_BR):
 *   Corpo:  "Olá, {{1}}! Seu horário na Zer0nze Co. é {{2}} ({{3}}). Você confirma presença?"
 *   Botão de URL dinâmica: https://SEU_DOMINIO/confirmar/{{1}}  → recebe o token do agendamento
 */
export async function sendConfirmationWhatsApp(params: {
  to: string;
  firstName: string;
  when: string; // "hoje às 15:00"
  service: string; // "Corte masculino com China"
  token: string;
}): Promise<SendResult> {
  if (whatsappProvider() === "SIMULADO") return { provider: "SIMULADO", ok: true };

  const template = process.env.WHATSAPP_TEMPLATE_CONFIRMACAO;
  if (!template) return { provider: "META", ok: false, error: "WHATSAPP_TEMPLATE_CONFIRMACAO não configurado" };

  const version = process.env.WHATSAPP_API_VERSION ?? "v23.0";
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to,
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: params.firstName },
                { type: "text", text: params.when },
                { type: "text", text: params.service },
              ],
            },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: params.token }] },
          ],
        },
      }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { provider: "META", ok: false, error: data?.error?.message ?? `HTTP ${res.status}` };
    return { provider: "META", ok: true, externalId: data?.messages?.[0]?.id };
  } catch (e) {
    return { provider: "META", ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
