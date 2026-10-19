import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, canManageRole, hashPassword, isRole, logAudit } from "@/lib/auth";
import { userUpdateSchema } from "@/lib/validation";

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
    const rows = await sql`SELECT id, role, name, active FROM users WHERE id = ${targetId}`;
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

    await sql`
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
