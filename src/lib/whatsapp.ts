import { firstName } from "./format";

export function waLink(phone: string | null | undefined, text?: string): string {
  const base = `https://wa.me/${(phone ?? "").replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export type TemplateCtx = {
  customerName: string;
  shopName: string;
  bookingUrl: string;
  serviceName?: string;
  when?: string; // ex.: "sábado, 15/11 às 10:30"
  professional?: string;
  reviewUrl?: string | null;
};

export const WHATSAPP_TEMPLATES: Record<string, { label: string; build: (c: TemplateCtx) => string }> = {
  lembrete: {
    label: "Lembrete de horário",
    build: (c) =>
      `Fala, ${firstName(c.customerName)}! Passando pra lembrar do seu horário na ${c.shopName}${
        c.when ? `: ${c.when}` : ""
      }${c.professional ? ` com ${c.professional}` : ""}. Qualquer imprevisto, avisa a gente por aqui. 💈`,
  },
  retorno: {
    label: "Convite de retorno",
    build: (c) =>
      `Fala, ${firstName(c.customerName)}! Faz um tempinho que você não aparece na ${c.shopName}. Bora renovar o visual? Agenda aqui em 1 minuto: ${c.bookingUrl}`,
  },
  aniversario: {
    label: "Feliz aniversário",
    build: (c) =>
      `Feliz aniversário, ${firstName(c.customerName)}! 🎉 A ${c.shopName} deseja um ótimo dia. Que tal comemorar com um corte novo? ${c.bookingUrl}`,
  },
  lead: {
    label: "Retomar agendamento",
    build: (c) =>
      `Oi, ${firstName(c.customerName)}! Vi que você começou a agendar${
        c.serviceName ? ` ${c.serviceName}` : ""
      } na ${c.shopName} e não finalizou. Posso te ajudar a achar um horário? ${c.bookingUrl}`,
  },
  avaliacao: {
    label: "Pedir avaliação",
    build: (c) =>
      `Valeu pela visita, ${firstName(c.customerName)}! Se curtiu o resultado, deixa sua avaliação pra gente — ajuda demais: ${
        c.reviewUrl ?? c.bookingUrl
      }`,
  },
};

export function appUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}
