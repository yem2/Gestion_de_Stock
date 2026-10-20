import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, canManageRole, isRole } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Demandes en attente qu'un administrateur peut traiter (rôles inférieurs au sien, sauf super administrateur). */
export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("users.manage"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT r.id, r.requested_at AS "requestedAt", u.name, u.email, u.role
      FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.used_at IS NULL AND r.token_hash IS NULL AND r.expires_at > NOW() AND u.active = TRUE
      ORDER BY r.requested_at DESC LIMIT 50
    `;
    const requests = rows.filter((row) => isRole(row.role) && canManageRole(auth.user.role, row.role));
    return NextResponse.json({ requests });
  } catch {
    return serverError();
  }
}
