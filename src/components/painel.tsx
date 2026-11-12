import { WEEKDAYS } from "@/lib/time";
import { cn } from "./ui";

export function Flash({ ok, erro }: { ok?: string; erro?: string }) {
  if (!ok && !erro) return null;
  return (
    <div
      role={erro ? "alert" : "status"}
      className={cn(
        "mb-5 rounded-lg px-4 py-3 text-sm",
        erro ? "border border-red-200 bg-red-50 text-red-800" : "border border-emerald-200 bg-emerald-50 text-emerald-800",
      )}
    >
      {erro ?? ok}
    </div>
  );
}

/** Campos de horário semanal: h_{dia}_on / h_{dia}_start / h_{dia}_end */
export function HoursEditor({ hours }: { hours: { weekday: number; start: string; end: string }[] }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="divide-y divide-stone-100 rounded-lg border border-stone-200">
      {order.map((wd) => {
        const h = hours.find((x) => x.weekday === wd);
        return (
          <div key={wd} className="flex items-center gap-3 px-3 py-2 text-sm">
            <label className="flex w-28 items-center gap-2">
              <input type="checkbox" name={`h_${wd}_on`} defaultChecked={!!h} className="size-4 accent-stone-900" />
              {WEEKDAYS[wd]}
            </label>
            <input
              type="time"
              name={`h_${wd}_start`}
              defaultValue={h?.start ?? "09:00"}
              className="h-8 rounded-md border border-stone-300 px-2 text-sm"
            />
            <span className="text-stone-400">até</span>
            <input
              type="time"
              name={`h_${wd}_end`}
              defaultValue={h?.end ?? "19:00"}
              className="h-8 rounded-md border border-stone-300 px-2 text-sm"
            />
          </div>
        );
      })}
    </div>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", accent ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white")}>
      <p className={cn("text-xs font-medium uppercase tracking-wide", accent ? "text-stone-400" : "text-stone-500")}>{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className={cn("mt-1 text-xs", accent ? "text-stone-400" : "text-stone-500")}>{hint}</p>}
    </div>
  );
}

export function relativeDays(date: Date | null | undefined): string {
  if (!date) return "—";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 0) {
    const ahead = -days;
    return ahead <= 1 ? "amanhã" : `em ${ahead} dias`;
  }
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  return months === 1 ? "há 1 mês" : `há ${months} meses`;
}
