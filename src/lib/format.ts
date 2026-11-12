export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Normaliza telefone brasileiro para dígitos com DDI 55. Retorna null se inválido. */
export function normalizePhone(input: string): string | null {
  let d = (input ?? "").replace(/\D/g, "");
  d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55\d{10,11}$/.test(d)) return null;
  return d;
}

export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  const d = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/** Converte "80,00" / "80" / "80.5" em centavos. */
export function parseMoneyToCents(input: string): number | null {
  const clean = (input ?? "").trim().replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(clean);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Aguardando pagamento",
  CONFIRMED: "Agendado",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Faltou",
  EXPIRED: "Expirado",
};

export const LEAD_STATUS_LABEL: Record<string, string> = {
  NEW: "Novo",
  CONTACTED: "Em contato",
  CONVERTED: "Convertido",
  LOST: "Perdido",
};

export const SOURCE_LABEL: Record<string, string> = {
  site: "Site",
  instagram: "Instagram",
  google: "Google",
  indicacao: "Indicação",
  whatsapp: "WhatsApp",
  manual: "Cadastro manual",
  importado: "Importado",
  balcao: "Balcão",
};

export const PAYMENT_MODE_LABEL: Record<string, string> = {
  NONE: "Pagamento no local",
  DEPOSIT: "Sinal antecipado",
  FULL: "Pagamento total antecipado",
};

export function computeDueOnline(priceCents: number, mode: string, depositPercent: number): number {
  if (mode === "FULL") return priceCents;
  if (mode === "DEPOSIT") return Math.max(100, Math.round((priceCents * depositPercent) / 100));
  return 0;
}
