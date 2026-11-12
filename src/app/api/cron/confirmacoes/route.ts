import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runConfirmationJob } from "@/lib/confirmations";

export const dynamic = "force-dynamic";

/**
 * Dispara os pedidos de confirmação de presença.
 * Chamado a cada minuto pelo agendador interno (src/instrumentation.ts) ou por um
 * cron externo (Vercel Cron, cron-job.org...) com o cabeçalho
 *   Authorization: Bearer <CRON_SECRET>
 */
function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const result = await runConfirmationJob();
  if (result.sent || result.failed) console.log("[confirmações]", result);
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
