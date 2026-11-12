import { NextResponse, type NextRequest } from "next/server";
import { syncMercadoPagoPayment, verifyMercadoPagoSignature } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * Webhook do Mercado Pago. Não confiamos no corpo: usamos só o ID para consultar
 * o pagamento na API do MP e então aplicamos o status.
 */
export async function POST(req: NextRequest) {
  const url = req.nextUrl;
  let body: { type?: string; action?: string; data?: { id?: string | number } } = {};
  try {
    body = await req.json();
  } catch {}

  const type = body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const dataId = String(body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");

  if (type !== "payment" || !dataId) return NextResponse.json({ ignored: true });

  const valid = verifyMercadoPagoSignature({
    xSignature: req.headers.get("x-signature"),
    xRequestId: req.headers.get("x-request-id"),
    dataId: url.searchParams.get("data.id") ?? dataId,
  });
  if (!valid) return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });

  try {
    await syncMercadoPagoPayment(dataId);
  } catch (e) {
    console.error("[mp webhook] erro ao sincronizar pagamento", dataId, e);
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 }); // MP tenta de novo
  }
  return NextResponse.json({ ok: true });
}
