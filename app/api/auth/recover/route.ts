import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { logAudit, newResetToken } from "@/lib/auth";
import { fail, parseBody, serverError } from "@/lib/api";
import { recoverSchema } from "@/lib/validation";

export const runtime = "nodejs";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

/**
 * Récupération par le propriétaire : avec la clé RECOVERY_KEY (variable Vercel) et l'e-mail du compte,
 * un lien de réinitialisation valable 1 h est délivré immédiatement. Désactivée si RECOVERY_KEY est absente.
 */
export async function POST(request: Request) {
  const recoveryKey = process.env.RECOVERY_KEY;
  if (!recoveryKey) return fail("La récupération par clé est désactivée.", 403);
  const body = await parseBody(request, recoverSchema);
  if ("error" in body) return body.error;

  try {
    const sql = getSql();
    const failures = await sql`
      SELECT COUNT(*)::int AS count FROM audit_log
      WHERE action = 'recovery_failed' AND created_at > NOW() - INTERVAL '15 minutes'
    `;
    if (Number(failures[0]?.count) >= 8) {
      return fail("Trop de tentatives. Réessayez dans quelques minutes.", 429);
    }
    if (!timingSafeEqual(digest(body.data.recoveryKey), digest(recoveryKey))) {
      await logAudit(null, "recovery_failed");
      return fail("Clé de récupération invalide.", 403);
    }
    const users = await sql`SELECT id FROM users WHERE LOWER(email) = ${body.data.email} AND active = TRUE`;
    if (!users[0]) return fail("Aucun compte actif avec cet e-mail.", 404);

    const { token, hash } = newResetToken();
    await sql`
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES (${users[0].id}::bigint, ${hash}, NOW() + INTERVAL '1 hour')
    `;
    await logAudit(Number(users[0].id), "password_recovery_key", "user", Number(users[0].id));
    return NextResponse.json({ token });
  } catch {
    return serverError("Récupération impossible.");
  }
}
