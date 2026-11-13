"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markConfirmationSentAction, sendConfirmationApiAction } from "@/app/painel/actions";
import { WhatsAppIcon, buttonClass, cn } from "./ui";

/**
 * Envia o pedido de confirmação.
 * - modo assistido: abre o WhatsApp da barbearia com a mensagem pronta e marca como enviado;
 * - modo automático (API oficial): envia pelo servidor.
 */
export function SendConfirmationButton({
  appointmentId,
  waUrl,
  auto,
  label = "Enviar",
  size = "sm",
  className,
  onSent,
}: {
  appointmentId: string;
  waUrl: string;
  auto: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  onSent?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (auto) {
    return (
      <span className="inline-flex flex-col">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await sendConfirmationApiAction(appointmentId);
              if (!r.ok) setError(r.error ?? "Falha no envio");
              else onSent?.();
              router.refresh();
            })
          }
          className={cn(buttonClass("whatsapp", size), className)}
        >
          <WhatsAppIcon /> {pending ? "Enviando…" : label}
        </button>
        {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <a
      href={waUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        start(async () => {
          onSent?.();
          await markConfirmationSentAction(appointmentId);
          router.refresh();
        })
      }
      className={cn(buttonClass("whatsapp", size), pending && "opacity-60", className)}
    >
      <WhatsAppIcon /> {label}
    </a>
  );
}
