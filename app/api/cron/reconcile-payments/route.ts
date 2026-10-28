import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { refreshSession, type SessionRow } from "@/lib/payments/sessions";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Rapprochement des paiements mobiles restés « en attente » (notification perdue, fenêtre fermée…).
 * Appelé par Vercel Cron avec l'en-tête Authorization: Bearer <CRON_SECRET> ; refusé si CRON_SECRET n'est pas défini.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  try {
    const sql = getSql();
    const open = (await sql`
      SELECT s.id, s.company_id AS "companyId", s.payment_id AS "paymentId", s.provider, s.external_id AS "externalId",
             s.pay_token AS "payToken", s.last_status AS "lastStatus", s.created_at AS "createdAt", p.amount, p.status AS "paymentStatus"
      FROM payment_provider_sessions s JOIN payments p ON p.id = s.payment_id AND p.company_id = s.company_id
      WHERE s.last_status IN ('initiated', 'pending') AND p.status = 'pending' AND s.created_at < NOW() - INTERVAL '1 minute'
      ORDER BY s.created_at ASC LIMIT 50`) as SessionRow[];
    const counts = { checked: 0, success: 0, failed: 0, expired: 0, pending: 0 };
    for (const session of open) {
      const status = await refreshSession(session);
      counts.checked += 1;
      counts[status] += 1;
    }
    return NextResponse.json(counts);
  } catch {
    return NextResponse.json({ error: "Rapprochement impossible." }, { status: 500 });
  }
}
