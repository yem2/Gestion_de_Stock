import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  DUMMY_HASH, SESSION_COOKIE, createSessionToken, logAudit, sessionCookieOptions, verifyPassword
} from "@/lib/auth";
import { loginSchema } from "@/lib/validation";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 5;
const GENERIC_ERROR = "E-mail ou mot de passe incorrect.";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  try {
    const sql = getSql();
    const { email, password } = parsed.data;
    const rows = await sql`
      SELECT id, password_hash AS "passwordHash", active, failed_attempts AS "failedAttempts",
             locked_until AS "lockedUntil", token_version AS "tokenVersion"
      FROM users WHERE LOWER(email) = ${email}
    `;
    const user = rows[0];
    const valid = await verifyPassword(password, user ? String(user.passwordHash) : DUMMY_HASH);

    if (user && user.lockedUntil && new Date(String(user.lockedUntil)).getTime() > Date.now()) {
      return NextResponse.json(
        { error: "Compte temporairement bloqué. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

    if (!user || !valid || !user.active) {
      if (user) {
        const attempts = Number(user.failedAttempts) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await sql`
            UPDATE users SET failed_attempts = 0,
              locked_until = NOW() + INTERVAL '15 minutes'
            WHERE id = ${user.id}
          `;
          await logAudit(Number(user.id), "login_locked", "user", Number(user.id));
        } else {
          await sql`UPDATE users SET failed_attempts = ${attempts} WHERE id = ${user.id}`;
        }
      }
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    await sql`
      UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW()
      WHERE id = ${user.id}
    `;
    await logAudit(Number(user.id), "login", "user", Number(user.id));

    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      SESSION_COOKIE,
      createSessionToken(Number(user.id), Number(user.tokenVersion)),
      sessionCookieOptions()
    );
    return response;
  } catch {
    return NextResponse.json({ error: "Service indisponible. Réessayez plus tard." }, { status: 503 });
  }
}
