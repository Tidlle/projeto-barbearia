// Avisos do painel no navegador (som + notificação). Só roda no cliente.

const KEY = "zer0nze:avisos";

export function alertsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAlertsEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
}

let ctx: AudioContext | null = null;

/** "Plim-plim" curto, gerado na hora (sem arquivo de áudio). */
export function playChime() {
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.35);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.4);
    });
  } catch {}
}

export function notify(title: string, body: string, url = "/painel/confirmacoes") {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification(title, { body, tag: "fila-confirmacoes" });
    n.onclick = () => {
      window.focus();
      window.location.href = url;
    };
  } catch {}
}
