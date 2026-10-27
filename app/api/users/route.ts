import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, canManageRole, hashPassword, logAudit } from "@/lib/auth";
import { userCreateSchema } from "@/lib/validation";
import { RBAC_ROLE_NAMES } from "@/lib/roles";

export const runtime = "nodejs";

const ADMINS = ["super_admin", "admin"] as const;

export async function GET(request: Request) {
  const auth = await authorize(request, ADMINS);
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const users = await sql`
      SELECT u.id, u.email, u.name, u.role, u.active, u.last_login_at AS "lastLoginAt", u.created_at AS "createdAt",
             (SELECT (extract(epoch FROM a.updated_at) * 1000)::bigint FROM user_avatars a WHERE a.user_id = u.id) AS "avatarVersion"
      FROM users u JOIN company_memberships m ON m.user_id = u.id AND m.company_id = ${auth.user.companyId}::uuid
      ORDER BY u.created_at ASC LIMIT 500
    `;
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authorize(request, ADMINS);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 }
    );
  }
  if (!canManageRole(auth.user.role, parsed.data.role)) {
    return NextResponse.json({ error: "Vous ne pouvez pas créer ce rôle." }, { status: 403 });
  }

  try {
    const sql = getSql();
    const passwordHash = await hashPassword(parsed.data.password);
    const rows = await sql`
      WITH u AS (
        INSERT INTO users (email, name, password_hash, role)
        VALUES (${parsed.data.email}, ${parsed.data.name}, ${passwordHash}, ${parsed.data.role})
        RETURNING id, email, name, role, active, created_at
      ), m AS (
        INSERT INTO company_memberships (company_id, user_id) SELECT ${auth.user.companyId}::uuid, u.id FROM u
        RETURNING id, company_id
      ), mr AS (
        INSERT INTO membership_roles (company_id, membership_id, role_id)
        SELECT m.company_id, m.id, r.id FROM m JOIN roles r ON r.company_id = m.company_id AND r.name = ${RBAC_ROLE_NAMES[parsed.data.role]}
        RETURNING 1
      )
      SELECT id, email, name, role, active, created_at AS "createdAt" FROM u
    `;
    await logAudit(auth.user.id, "user_create", "user", Number(rows[0].id), parsed.data.role);
    return NextResponse.json({ user: rows[0] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique")) {
      return NextResponse.json({ error: "Cet e-mail est déjà utilisé." }, { status: 409 });
    }
    return NextResponse.json({ error: "Impossible de créer l’utilisateur." }, { status: 500 });
  }
}
