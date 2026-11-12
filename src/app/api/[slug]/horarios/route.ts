import { NextResponse, type NextRequest } from "next/server";
import { getDaySlots } from "@/lib/availability";
import { getShopBySlug } from "@/lib/shop";
import { isValidDateKey } from "@/lib/time";

export const dynamic = "force-dynamic";

// GET /api/{slug}/horarios?servico=ID&profissional=ID&data=YYYY-MM-DD
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const serviceId = sp.get("servico");
  const professionalId = sp.get("profissional") || null;
  const dateKey = sp.get("data");
  if (!serviceId || !isValidDateKey(dateKey)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const result = await getDaySlots({ shop, serviceId, professionalId, dateKey });
  if (!result) return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 });

  return NextResponse.json(
    { slots: result.slots.map((s) => ({ time: s.time, startsAt: s.startsAt })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
