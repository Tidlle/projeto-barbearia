"use client";

import { useTransition } from "react";
import { logWhatsApp } from "@/app/painel/actions";
import { waLink } from "@/lib/whatsapp";
import { WhatsAppIcon, buttonClass, cn } from "./ui";

/** Abre o WhatsApp com mensagem pronta e registra o contato na linha do tempo do cliente. */
export function WhatsAppButton({
  customerId,
  phone,
  text,
  label,
  logLabel,
  size = "sm",
  variant = "whatsapp",
  className,
}: {
  customerId: string;
  phone: string;
  text?: string;
  label?: string;
  logLabel?: string;
  size?: "sm" | "md";
  variant?: "whatsapp" | "outline" | "ghost";
  className?: string;
}) {
  const [, start] = useTransition();
  return (
    <a
      href={waLink(phone, text)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => start(() => logWhatsApp(customerId, logLabel ?? label ?? "mensagem"))}
      className={cn(buttonClass(variant, size), className)}
      title={text}
    >
      <WhatsAppIcon />
      {label}
    </a>
  );
}
