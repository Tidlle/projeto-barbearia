import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { filterSegment, getCustomersWithStats, searchCustomers, SEGMENTS, type Segment } from "@/lib/crm";
import { toCsv } from "@/lib/csv";
import { formatPhone, LEAD_STATUS_LABEL, SOURCE_LABEL } from "@/lib/format";
import { dateKeyInTz } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/entrar", req.url));
  const shop = user.barbershop;
  const sp = req.nextUrl.searchParams;
  const seg = sp.get("segmento");
  const segment: Segment = seg && seg in SEGMENTS ? (seg as Segment) : "todos";
  const list = searchCustomers(filterSegment(await getCustomersWithStats(shop), segment, shop.timezone), sp.get("q") ?? "");

  const d = (x: Date | null) => (x ? dateKeyInTz(x, shop.timezone).split("-").reverse().join("/") : "");
  const csv = toCsv([
    ["nome", "telefone", "email", "aniversario", "visitas", "total_gasto", "ultima_visita", "proximo_horario", "origem", "status_lead", "aceita_mensagens", "tags", "observacoes"],
    ...list.map((c) => [
      c.name,
      formatPhone(c.phone),
      c.email,
      c.birthday ? c.birthday.toISOString().slice(0, 10).split("-").reverse().join("/") : "",
      c.visits,
      (c.totalSpentCents / 100).toFixed(2).replace(".", ","),
      d(c.lastVisit),
      d(c.nextAppointment),
      SOURCE_LABEL[c.source ?? ""] ?? c.source,
      c.isClient ? "Cliente" : LEAD_STATUS_LABEL[c.leadStatus],
      c.marketingConsent ? "sim" : "não",
      c.tags.join(", "),
      c.notes,
    ]),
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${shop.slug}-${segment}.csv"`,
    },
  });
}
