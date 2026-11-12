// Utilitários de data/hora no fuso da barbearia, sem dependências externas.
// "dateKey" = "YYYY-MM-DD" no fuso local da barbearia; "HH:mm" = horário local.

const offsetCache = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(tz: string) {
  let f = offsetCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" });
    offsetCache.set(tz, f);
  }
  return f;
}

/** Deslocamento do fuso em minutos no instante dado (ex.: São Paulo = -180). */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const name = offsetFormatter(tz).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** Converte data + hora locais da barbearia para um instante UTC. */
export function zonedToUtc(dateKey: string, time: string, tz: string): Date {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let result = naive - tzOffsetMinutes(tz, new Date(naive)) * 60_000;
  // segunda passada cobre mudanças de horário de verão
  result = naive - tzOffsetMinutes(tz, new Date(result)) * 60_000;
  return new Date(result);
}

function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return p as Record<"year" | "month" | "day" | "hour" | "minute", string>;
}

export function dateKeyInTz(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function timeInTz(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p.hour}:${p.minute}`;
}

/** Dia da semana (0=domingo) de uma dateKey. */
export function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

export function addDaysToKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function timeOfMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function isValidDateKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
}

export function isValidTime(v: unknown): v is string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function formatDate(date: Date, tz: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, ...opts }).format(date);
}

export function formatDateKey(dateKey: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...opts }).format(new Date(`${dateKey}T12:00:00Z`));
}

export function daysAgo(days: number): Date {
  return new Date(new Date().getTime() - days * 86_400_000);
}

/** "sábado, 15/11 às 10:30" */
export function formatWhen(date: Date, tz: string) {
  const day = formatDate(date, tz, { weekday: "long", day: "2-digit", month: "2-digit" });
  return `${day} às ${timeInTz(date, tz)}`;
}
