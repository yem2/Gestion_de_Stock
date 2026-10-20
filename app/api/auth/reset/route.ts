import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { hashPassword, hashToken, logAudit } from "@/lib/auth";
import { fail, parseBody, serverError } from "@/lib/api";
import { resetSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Utilise un lien à usage unique : change le mot de passe et ferme toutes les sessions ouvertes. */
export async function POST(request: Request) {
  const body = await parseBody(request, resetSchema);
  if ("error" in body) return body.error;

  try {
    const sql = getSql();
    const passwordHash = await hashPassword(body.data.password);
    const rows = await sql`
      WITH r AS (
        UPDATE password_resets SET used_at = NOW()
        WHERE token_hash = ${hashToken(body.data.token)} AND used_at IS NULL AND expires_at > NOW()
        RETURNING id, user_id
      ), u AS (
        UPDATE users SET password_hash = ${passwordHash}, token_version = token_version + 1,
               failed_attempts = 0, locked_until = NULL, updated_at = NOW()
        WHERE id IN (SELECT user_id FROM r) AND active = TRUE
        RETURNING id
      ), o AS (
        UPDATE password_resets SET used_at = NOW()
        WHERE user_id IN (SELECT user_id FROM r) AND used_at IS NULL AND id NOT IN (SELECT id FROM r)
        RETURNING 1
      )
      SELECT (SELECT id FROM u) AS id
    `;
    if (rows[0]?.id == null) return fail("Lien invalide ou expiré. Refaites une demande.", 400);
    await logAudit(Number(rows[0].id), "password_reset_done", "user", Number(rows[0].id));
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Impossible de changer le mot de passe.");
  }
}
