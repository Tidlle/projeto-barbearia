"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setAttendanceConfirmed, skipConfirmationAction, undoConfirmationSentAction } from "@/app/painel/actions";
import { SendConfirmationButton } from "@/components/confirmation-buttons";
import { Badge, Button, Card, cn } from "@/components/ui";
import { alertsEnabled, playChime, setAlertsEnabled } from "@/lib/alerts";

export type QueueRow = {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  when: string;
  service: string;
  late: boolean;
  message: string;
  waUrl: string;
};

/** A esteira: mostra o próximo da fila em destaque e envia com um toque. */
export function QueueRunner({ items, auto }: { items: QueueRow[]; auto: boolean }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<string[]>([]);
  const [lastSent, setLastSent] = useState<QueueRow | null>(null);
  const [pending, start] = useTransition();

  // atualiza a fila sozinha (novos horários entrando)
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);

  const visible = items.filter((i) => !hidden.includes(i.id));
  const [next, ...rest] = visible;

  const sent = (row: QueueRow) => {
    setHidden((h) => [...h, row.id]);
    setLastSent(row);
  };
  const act = (row: QueueRow, fn: () => Promise<unknown>) => {
    setHidden((h) => [...h, row.id]);
    start(async () => {
      await fn();
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {lastSent && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-oliva px-4 py-3 text-sm text-creme">
          <span>
            ✓ Pedido para <strong>{lastSent.customerName}</strong> marcado como enviado.
          </span>
          <button
            className="shrink-0 underline"
            disabled={pending}
            onClick={() => {
              const row = lastSent;
              setLastSent(null);
              setHidden((h) => h.filter((id) => id !== row.id));
              start(async () => {
                await undoConfirmationSentAction(row.id);
                router.refresh();
              });
            }}
          >
            Desfazer
          </button>
        </div>
      )}

      {!next ? (
        <Card className="p-8 text-center">
          <p className="text-3xl">✓</p>
          <p className="mt-2 font-semibold">Fila vazia</p>
          <p className="mt-1 text-sm text-stone-500">Quando chegar a hora de um pedido, ele aparece aqui sozinho.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden border-oliva/30">
          <div className="flex items-center justify-between bg-oliva/5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-oliva">
            <span>Próximo da fila</span>
            <span>{visible.length} para enviar</span>
          </div>
          <div className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link href={`/painel/clientes/${next.customerId}`} className="text-xl font-semibold hover:underline">
                  {next.customerName}
                </Link>
                <p className="text-sm text-stone-500">
                  {next.phone} · {next.service} · <span className="first-letter:uppercase">{next.when}</span>
                </p>
              </div>
              {next.late && <Badge tone="red">Atrasado</Badge>}
            </div>
            <p className="mt-4 rounded-xl bg-[#e7f7ec] p-4 text-sm leading-relaxed text-stone-800">{next.message}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <SendConfirmationButton
                appointmentId={next.id}
                waUrl={next.waUrl}
                auto={auto}
                size="lg"
                label={auto ? "Enviar agora" : "Enviar pelo WhatsApp"}
                onSent={() => sent(next)}
              />
              <Button
                variant="outline"
                onClick={() =>
                  act(next, () => {
                    const fd = new FormData();
                    fd.set("id", next.id);
                    return setAttendanceConfirmed(fd);
                  })
                }
              >
                Já confirmou
              </Button>
              <Button variant="ghost" onClick={() => act(next, () => skipConfirmationAction(next.id))}>
                Dispensar
              </Button>
            </div>
            {!auto && (
              <p className="mt-3 text-xs text-stone-500">
                O WhatsApp abre com a mensagem pronta: é só tocar em enviar e voltar para cá. O próximo já estará esperando.
              </p>
            )}
          </div>
        </Card>
      )}

      {rest.length > 0 && (
        <Card>
          <p className="border-b border-stone-100 px-5 py-3 text-sm font-semibold">Na sequência</p>
          <ul className="divide-y divide-stone-100">
            {rest.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{r.customerName}</span>{" "}
                  <span className="text-stone-500">
                    · {r.service} · {r.when}
                  </span>
                </div>
                {r.late && <Badge tone="red">Atrasado</Badge>}
                <SendConfirmationButton appointmentId={r.id} waUrl={r.waUrl} auto={auto} onSent={() => sent(r)} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Liga/desliga aviso sonoro + notificação do navegador quando entra alguém na fila. */
export function AlertsToggle() {
  const [on, setOn] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    // lê a preferência salva só no navegador (depois da hidratação)
    const t = setTimeout(() => {
      setOn(alertsEnabled());
      setDenied(typeof Notification !== "undefined" && Notification.permission === "denied");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={on ? "primary" : "outline"}
        size="sm"
        onClick={async () => {
          const next = !on;
          setOn(next);
          setAlertsEnabled(next);
          if (next) {
            playChime();
            if (typeof Notification !== "undefined" && Notification.permission === "default") {
              const p = await Notification.requestPermission();
              setDenied(p === "denied");
            }
          }
        }}
      >
        {on ? "🔔 Avisos ligados" : "🔕 Ligar avisos com som"}
      </Button>
      {denied && <span className="text-xs text-stone-500">Notificações bloqueadas no navegador — só o som vai tocar.</span>}
      <span className={cn("text-xs text-stone-500", on ? "" : "hidden")}>Deixe o painel aberto no computador ou celular da recepção.</span>
    </div>
  );
}
