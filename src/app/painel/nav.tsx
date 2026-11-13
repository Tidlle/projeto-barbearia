"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { alertsEnabled, notify, playChime } from "@/lib/alerts";

const ITEMS = [
  { href: "/painel", label: "Visão geral", icon: "◎" },
  { href: "/painel/agenda", label: "Agenda", icon: "▦" },
  { href: "/painel/confirmacoes", label: "Confirmações", icon: "✓", queue: true },
  { href: "/painel/clientes", label: "Clientes", icon: "☰" },
  { href: "/painel/leads", label: "Leads", icon: "✦" },
  { href: "/painel/mensagens", label: "Mensagens", icon: "✉" },
  { href: "/painel/servicos", label: "Serviços", icon: "✂" },
  { href: "/painel/equipe", label: "Equipe", icon: "☺" },
  { href: "/painel/configuracoes", label: "Configurações", icon: "⚙" },
];

const POLL_MS = 30_000;

export function PainelNav({ initialQueueCount }: { initialQueueCount: number }) {
  const path = usePathname();
  const [count, setCount] = useState(initialQueueCount);
  const [prevInitial, setPrevInitial] = useState(initialQueueCount);
  const last = useRef(initialQueueCount);
  // o servidor manda um número novo a cada atualização da página (ex.: depois de enviar)
  if (initialQueueCount !== prevInitial) {
    setPrevInitial(initialQueueCount);
    setCount(initialQueueCount);
  }
  useEffect(() => {
    last.current = initialQueueCount;
  }, [initialQueueCount]);

  // consulta a fila; quando entra alguém novo, toca o aviso e mostra notificação
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/painel/fila", { cache: "no-store" });
        if (!res.ok) return;
        const data: { count: number; next: string | null } = await res.json();
        if (!alive) return;
        if (data.count > last.current && alertsEnabled()) {
          playChime();
          notify(
            data.count === 1 ? "1 confirmação para enviar" : `${data.count} confirmações para enviar`,
            data.next ? `Próximo: ${data.next}` : "Abra a fila de confirmações",
          );
        }
        last.current = data.count;
        setCount(data.count);
      } catch {}
    };
    const t = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // contador também no título da aba (reaplicado quando o Next troca o título ao navegar)
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\)\s*/, "");
      const want = count > 0 ? `(${count}) ${base}` : base;
      if (document.title !== want) document.title = want;
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, [count]);

  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3 md:pb-0">
      {ITEMS.map((item) => {
        const active = item.href === "/painel" ? path === "/painel" : path.startsWith(item.href);
        const badge = item.queue && count > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
              active ? "bg-creme/10 text-creme" : "text-creme/60 hover:bg-creme/5 hover:text-creme",
            )}
          >
            <span className={cn("w-4 text-center", active && "text-brand")}>{item.icon}</span>
            {item.label}
            {badge && (
              <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-brand-ink">
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
