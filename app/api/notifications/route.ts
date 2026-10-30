import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Notifications de l'utilisateur connecté (les plus récentes d'abord) et nombre de non lues. */
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 20, 1), 100);
  const unreadOnly = params.get("unread") === "1";
  try {
    const sql = getSql();
    const [rows, count] = await Promise.all([
      sql`
        SELECT id, type, payload->>'title' AS title, payload->>'body' AS body, payload->>'link' AS link,
               COALESCE(payload->>'severity', 'info') AS severity, read_at IS NOT NULL AS read, created_at AS "createdAt"
        FROM notifications
        WHERE company_id = ${auth.user.companyId}::uuid AND user_id = ${auth.user.id}::bigint
          AND (NOT ${unreadOnly}::boolean OR read_at IS NULL)
        ORDER BY created_at DESC LIMIT ${limit}`,
      sql`SELECT COUNT(*)::int AS unread FROM notifications WHERE company_id = ${auth.user.companyId}::uuid AND user_id = ${auth.user.id}::bigint AND read_at IS NULL`
    ]);
    return NextResponse.json({ notifications: rows, unread: count[0].unread });
  } catch {
    return serverError();
  }
}
