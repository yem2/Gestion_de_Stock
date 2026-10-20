import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  SESSION_COOKIE, authorize, createSessionToken, hashPassword, logAudit, sessionCookieOptions, verifyPassword
} from "@/lib/auth";
import { fail, parseBody, serverError } from "@/lib/api";
import { changePasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Changement de son propre mot de passe : exige l'ancien, ferme les autres sessions et garde celle-ci ouverte. */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, changePasswordSchema);
  if ("error" in body) return body.error;

  try {
    const sql = getSql();
    const failures = await sql`
      SELECT COUNT(*)::int AS count FROM audit_log
      WHERE user_id = ${auth.user.id}::bigint AND action = 'password_change_failed' AND created_at > NOW() - INTERVAL '15 minutes'
    `;
    if (Number(failures[0]?.count) >= 5) return fail("Trop de tentatives. Réessayez dans quelques minutes.", 429);

    const rows = await sql`SELECT password_hash AS "passwordHash" FROM users WHERE id = ${auth.user.id}::bigint`;
    if (!rows[0] || !(await verifyPassword(body.data.currentPassword, String(rows[0].passwordHash)))) {
      await logAudit(auth.user.id, "password_change_failed", "user", auth.user.id);
      return fail("Mot de passe actuel incorrect.", 403);
    }
    const passwordHash = await hashPassword(body.data.newPassword);
    const updated = await sql`
      UPDATE users SET password_hash = ${passwordHash}, token_version = token_version + 1, updated_at = NOW()
      WHERE id = ${auth.user.id}::bigint RETURNING token_version AS "tokenVersion"
    `;
    await logAudit(auth.user.id, "password_change", "user", auth.user.id);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      SESSION_COOKIE,
      createSessionToken(auth.user.id, Number(updated[0].tokenVersion)),
      sessionCookieOptions()
    );
    return response;
  } catch {
    return serverError("Impossible de changer le mot de passe.");
  }
}
