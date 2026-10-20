import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { logAudit, newResetToken } from "@/lib/auth";
import { mailConfigured, sendMail } from "@/lib/mail";
import { parseBody } from "@/lib/api";
import { forgotSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Demande de réinitialisation. La réponse est toujours identique pour ne pas révéler si un e-mail existe.
 * Avec l'envoi d'e-mails activé, un lien valable 1 h est envoyé ; sinon la demande attend un administrateur.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, forgotSchema);
  if ("error" in body) return body.error;
  const generic = NextResponse.json({ ok: true });

  try {
    const sql = getSql();
    const users = await sql`SELECT id, name, email FROM users WHERE LOWER(email) = ${body.data.email} AND active = TRUE`;
    const user = users[0];
    if (!user) return generic;

    const mailer = mailConfigured();
    const { token, hash } = newResetToken();
    const rows = await sql`
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      SELECT ${user.id}::bigint, ${mailer ? hash : null}::text, NOW() + (${mailer ? 1 : 24}::int * INTERVAL '1 hour')
      WHERE (
        SELECT COUNT(*) FROM password_resets
        WHERE user_id = ${user.id}::bigint AND requested_at > NOW() - INTERVAL '1 hour'
      ) < 3
      RETURNING id
    `;
    if (!rows[0]) return generic;
    await logAudit(Number(user.id), "password_reset_request", "user", Number(user.id));

    if (mailer) {
      const link = `${new URL(request.url).origin}/reset-password?token=${token}`;
      const sent = await sendMail(
        String(user.email),
        "Réinitialisation de votre mot de passe",
        `Bonjour ${user.name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${link}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.`
      );
      if (!sent) {
        // Repli : la demande devient visible pour un administrateur.
        await sql`
          UPDATE password_resets SET token_hash = NULL, expires_at = NOW() + INTERVAL '24 hours'
          WHERE id = ${rows[0].id}
        `;
      }
    }
  } catch {
    // Réponse volontairement identique en cas d'erreur.
  }
  return generic;
}
