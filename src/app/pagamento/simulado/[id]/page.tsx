import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { mockPaymentsAllowed } from "@/lib/payments";
import { SubmitButton } from "@/components/submit-button";
import { approveMockPayment, rejectMockPayment } from "./actions";

export const metadata: Metadata = { title: "Pagamento simulado", robots: { index: false } };

/** Tela que imita o checkout em desenvolvimento (sem credenciais do Mercado Pago). */
export default async function MockCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  if (!mockPaymentsAllowed()) notFound();
  const { id } = await params;
  const payment = await db.payment.findUnique({
    where: { id },
    include: { appointment: { include: { service: true, barbershop: true } } },
  });
  if (!payment || payment.provider !== "MOCK") notFound();

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <p className="rounded-md bg-amber-100 px-2 py-1 text-center text-xs font-semibold text-amber-900">
          AMBIENTE DE TESTE — nenhum valor é cobrado
        </p>
        <p className="mt-5 text-sm text-stone-500">{payment.appointment.barbershop.name}</p>
        <p className="font-medium text-stone-900">
          {payment.kind === "DEPOSIT" ? "Sinal · " : ""}
          {payment.appointment.service.name}
        </p>
        <p className="mt-2 text-3xl font-semibold text-stone-900">{formatMoney(payment.amountCents)}</p>

        <div className="mx-auto mt-6 grid size-40 grid-cols-8 gap-0.5 rounded-lg border p-2" aria-hidden>
          {Array.from({ length: 64 }, (_, i) => (
            <span key={i} className={(i * 7 + id.charCodeAt(i % id.length)) % 3 === 0 ? "bg-stone-900" : "bg-white"} />
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-stone-500">Pix simulado</p>

        <p className="mt-4 text-center text-sm">
          Status atual: <strong>{payment.status}</strong>
        </p>

        <form action={approveMockPayment} className="mt-5">
          <input type="hidden" name="id" value={payment.id} />
          <SubmitButton className="w-full" pendingText="Processando…" disabled={payment.status === "APPROVED"}>
            Simular pagamento aprovado
          </SubmitButton>
        </form>
        <form action={rejectMockPayment} className="mt-2">
          <input type="hidden" name="id" value={payment.id} />
          <SubmitButton variant="outline" className="w-full" pendingText="Processando…" disabled={payment.status === "APPROVED"}>
            Simular pagamento recusado
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
