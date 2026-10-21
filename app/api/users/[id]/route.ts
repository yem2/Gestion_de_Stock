import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, canManageRole, hashPassword, isRole, logAudit } from "@/lib/auth";
import { userUpdateSchema } from "@/lib/validation";
import { RBAC_ROLE_NAMES, type Role } from "@/lib/roles";

export const runtime = "nodejs";

const ADMINS = ["super_admin", "admin"] as const;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, ADMINS);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 }
    );
  }
  const changes = parsed.data;

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT u.id, u.role, u.name, u.active FROM users u
      JOIN company_memberships m ON m.user_id = u.id AND m.company_id = ${auth.user.companyId}::uuid
      WHERE u.id = ${targetId}
    `;
    const target = rows[0];
    if (!target || !isRole(target.role)) {
      return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
    }
    if (targetId === auth.user.id && (changes.role !== undefined || changes.active !== undefined)) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas modifier votre propre rôle ou statut." },
        { status: 403 }
      );
    }
    if (targetId !== auth.user.id && !canManageRole(auth.user.role, target.role)) {
      return NextResponse.json({ error: "Vous ne pouvez pas modifier cet utilisateur." }, { status: 403 });
    }
    if (changes.role !== undefined && !canManageRole(auth.user.role, changes.role)) {
      return NextResponse.json({ error: "Vous ne pouvez pas attribuer ce rôle." }, { status: 403 });
    }

    const name = changes.name ?? String(target.name);
    const role = changes.role ?? target.role;
    const active = changes.active ?? Boolean(target.active);
    const passwordHash = changes.password ? await hashPassword(changes.password) : null;
    // Un changement de rôle, de statut ou de mot de passe ferme les sessions ouvertes.
    const revoke = changes.role !== undefined || changes.active !== undefined || changes.password !== undefined;

    // Utilisateur, appartenance et rôle RBAC sont mis à jour dans la même instruction.
    const rbacName = RBAC_ROLE_NAMES[role as Role];
    await sql`
      WITH u AS (
        UPDATE users SET
          name = ${name},
          role = ${role},
          active = ${active},
          password_hash = COALESCE(${passwordHash}, password_hash),
          token_version = token_version + ${revoke && targetId !== auth.user.id ? 1 : 0},
          failed_attempts = 0,
          locked_until = NULL,
          updated_at = NOW()
        WHERE id = ${targetId}
        RETURNING id
      ), m AS (
        UPDATE company_memberships SET status = ${active ? "active" : "suspended"}
        WHERE user_id = ${targetId} AND company_id = ${auth.user.companyId}::uuid
        RETURNING id, company_id
      ), del AS (
        DELETE FROM membership_roles mr USING m
        WHERE mr.membership_id = m.id
          AND mr.role_id NOT IN (SELECT id FROM roles WHERE company_id = m.company_id AND name = ${rbacName})
        RETURNING 1
      )
      INSERT INTO membership_roles (company_id, membership_id, role_id)
      SELECT m.company_id, m.id, r.id FROM m JOIN roles r ON r.company_id = m.company_id AND r.name = ${rbacName}
      ON CONFLICT DO NOTHING
    `;
    await logAudit(
      auth.user.id, "user_update", "user", targetId,
      Object.keys(changes).filter((key) => key !== "password").join(",") + (changes.password ? ",password" : "")
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Impossible de modifier l’utilisateur." }, { status: 500 });
  }
}
