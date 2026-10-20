import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, canManageRole, isRole, logAudit, newResetToken } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, parseId, serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Génère un lien de réinitialisation à usage unique (1 h) à remettre à l'utilisateur. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("users.manage"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT u.id AS "userId", u.role FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.id = ${id} AND r.used_at IS NULL AND r.token_hash IS NULL AND r.expires_at > NOW() AND u.active = TRUE
    `;
    const target = rows[0];
    if (!target) return fail("Demande introuvable ou déjà traitée.", 404);
    if (!isRole(target.role) || !canManageRole(auth.user.role, target.role)) {
      return fail("Vous ne pouvez pas traiter cette demande.", 403);
    }
    const { token, hash } = newResetToken();
    const updated = await sql`
      UPDATE password_resets SET token_hash = ${hash}, expires_at = NOW() + INTERVAL '1 hour'
      WHERE id = ${id} AND token_hash IS NULL AND used_at IS NULL RETURNING id
    `;
    if (!updated[0]) return fail("Demande déjà traitée.", 409);
    await logAudit(auth.user.id, "password_reset_link", "user", Number(target.userId));
    return NextResponse.json({ link: `${new URL(request.url).origin}/reset-password?token=${token}` });
  } catch {
    return serverError("Impossible de générer le lien.");
  }
}
