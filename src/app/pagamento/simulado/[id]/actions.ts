"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { applyPaymentStatus, mockPaymentsAllowed } from "@/lib/payments";

async function finish(formData: FormData, status: "APPROVED" | "REJECTED") {
  if (!mockPaymentsAllowed()) throw new Error("Pagamento simulado desativado");
  const id = String(formData.get("id") ?? "");
  const payment = await db.payment.findUnique({
    where: { id },
    include: { appointment: { include: { barbershop: true } } },
  });
  if (!payment || payment.provider !== "MOCK") throw new Error("Pagamento não encontrado");
  await applyPaymentStatus(id, status, `mock_${Date.now()}`);
  redirect(`/${payment.appointment.barbershop.slug}/agendamento/${payment.appointment.publicToken}`);
}

export async function approveMockPayment(formData: FormData) {
  await finish(formData, "APPROVED");
}

export async function rejectMockPayment(formData: FormData) {
  await finish(formData, "REJECTED");
}
