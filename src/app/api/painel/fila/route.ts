import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getConfirmationQueue } from "@/lib/confirmations";

export const dynamic = "force-dynamic";

/** Quantos pedidos de confirmação estão na fila agora (o painel consulta a cada 30s). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { ready } = await getConfirmationQueue(user.barbershop);
  return NextResponse.json(
    { count: ready.length, next: ready[0] ? ready[0].appointment.customer.name : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
