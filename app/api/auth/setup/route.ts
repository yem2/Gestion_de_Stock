import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { clientIp, hashPassword, isIpThrottled, logAudit, recordFailedAttempt } from "@/lib/auth";
import { setupSchema } from "@/lib/validation";

export const runtime = "nodejs";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

/** Création du tout premier super administrateur, protégée par SETUP_KEY. Impossible dès qu'un compte existe. */
export async function POST(request: Request) {
  const setupKey = process.env.SETUP_KEY;
  if (!setupKey) {
    return NextResponse.json({ error: "Configuration initiale désactivée." }, { status: 403 });
  }

  const ip = clientIp(request);
  if (await isIpThrottled(ip)) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 }
    );
  }
  if (!timingSafeEqual(digest(parsed.data.setupKey), digest(setupKey))) {
    await recordFailedAttempt(ip);
    return NextResponse.json({ error: "Clé de configuration invalide." }, { status: 403 });
  }

  try {
    const sql = getSql();
    const existing = await sql`SELECT COUNT(*)::int AS count FROM users`;
    if (Number(existing[0]?.count) > 0) {
      return NextResponse.json({ error: "La configuration initiale est déjà faite." }, { status: 403 });
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const rows = await sql`
      INSERT INTO users (email, name, password_hash, role)
      VALUES (${parsed.data.email}, ${parsed.data.name}, ${passwordHash}, 'super_admin')
      RETURNING id
    `;
    await logAudit(Number(rows[0].id), "setup_super_admin", "user", Number(rows[0].id));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Impossible de créer le compte. Vérifiez que la migration 0001 a été exécutée." },
      { status: 500 }
    );
  }
}
