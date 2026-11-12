"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const ITEMS = [
  { href: "/painel", label: "Visão geral", icon: "◎" },
  { href: "/painel/agenda", label: "Agenda", icon: "▦" },
  { href: "/painel/clientes", label: "Clientes", icon: "☰" },
  { href: "/painel/leads", label: "Leads", icon: "✦" },
  { href: "/painel/mensagens", label: "Mensagens", icon: "✉" },
  { href: "/painel/servicos", label: "Serviços", icon: "✂" },
  { href: "/painel/equipe", label: "Equipe", icon: "☺" },
  { href: "/painel/configuracoes", label: "Configurações", icon: "⚙" },
];

export function PainelNav() {
  const path = usePathname();
  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3 md:pb-0">
      {ITEMS.map((item) => {
        const active = item.href === "/painel" ? path === "/painel" : path.startsWith(item.href);
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
          </Link>
        );
      })}
    </nav>
  );
}
