/**
 * Agendador interno: a cada minuto chama a rota que envia os pedidos de confirmação
 * de presença. Serve para servidor sempre ligado (dev, VPS, Railway, Render...).
 * Em hospedagem serverless (Vercel), desligue com INTERNAL_SCHEDULER="false" e use um
 * cron externo chamando /api/cron/confirmacoes — ver README.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.INTERNAL_SCHEDULER === "false") return;

  const g = globalThis as { __confirmationTimer?: ReturnType<typeof setInterval> };
  if (g.__confirmationTimer) return; // evita timers duplicados no recarregamento do dev

  const base = process.env.INTERNAL_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
  const tick = async () => {
    try {
      await fetch(`${base}/api/cron/confirmacoes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
        cache: "no-store",
      });
    } catch {
      // servidor ainda subindo ou momentaneamente indisponível: tenta no próximo minuto
    }
  };
  g.__confirmationTimer = setInterval(tick, 60_000);
  setTimeout(tick, 15_000);
}
