import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { serverError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("audit.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const entries = await sql`
      SELECT a.id, a.action, a.entity, a.entity_id AS "entityId", a.detail, a.created_at AS "createdAt", u.name AS "userName"
      FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC, a.id DESC LIMIT 300
    `;
    return NextResponse.json({ entries });
  } catch {
    return serverError();
  }
}
