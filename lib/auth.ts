import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isRole, type Role } from "@/lib/roles";

export {
  ROLES, ROLE_LABELS, STOCK_MANAGERS, STOCK_WRITERS, canManageRole, isRole, roleRank
} from "@/lib/roles";
export type { Role } from "@/lib/roles";

export const SESSION_COOKIE = "gs_session";
const SESSION_SECONDS = 60 * 60 * 8;

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
};

function scryptAsync(password: string, salt: Buffer, keyLength: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Hash factice pour que la durée de réponse ne révèle pas si un e-mail existe.
export const DUMMY_HASH = `scrypt$${"00".repeat(16)}$${"00".repeat(64)}`;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET manquante ou trop courte (32 caractères minimum).");
  }
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: number, tokenVersion: number) {
  const expires = Date.now() + SESSION_SECONDS * 1000;
  const payload = `${userId}.${tokenVersion}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS
  };
}

function parseToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [id, version, expires, signature] = parts;
  const expected = sign(`${id}.${version}.${expires}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) < Date.now()) return null;
  const userId = Number(id);
  const tokenVersion = Number(version);
  if (!Number.isInteger(userId) || !Number.isInteger(tokenVersion)) return null;
  return { userId, tokenVersion };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const parsed = parseToken(token);
    if (!parsed) return null;
    const sql = getSql();
    const rows = await sql`
      SELECT id, email, name, role, active, token_version AS "tokenVersion"
      FROM users WHERE id = ${parsed.userId}
    `;
    const row = rows[0];
    if (!row || !row.active || row.tokenVersion !== parsed.tokenVersion || !isRole(row.role)) return null;
    return { id: Number(row.id), email: String(row.email), name: String(row.name), role: row.role };
  } catch {
    return null;
  }
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/**
 * Contrôle d'accès des routes API : session valide, rôle autorisé, origine identique pour les écritures.
 */
export async function authorize(
  request: Request,
  allowed?: readonly Role[]
): Promise<{ user: SessionUser } | { error: NextResponse }> {
  if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request)) {
    return { error: NextResponse.json({ error: "Origine non autorisée." }, { status: 403 }) };
  }
  const user = await getSessionUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Authentification requise." }, { status: 401 }) };
  }
  if (allowed && !allowed.includes(user.role)) {
    return { error: NextResponse.json({ error: "Accès refusé pour votre rôle." }, { status: 403 }) };
  }
  return { user };
}

export async function logAudit(
  userId: number | null,
  action: string,
  entity?: string,
  entityId?: string | number,
  detail?: string
) {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO audit_log (user_id, action, entity, entity_id, detail)
      VALUES (${userId}, ${action}, ${entity ?? null}, ${entityId === undefined ? null : String(entityId)}, ${detail ?? null})
    `;
  } catch {
    // Le journal ne doit jamais bloquer l'action principale.
  }
}

/** Adresse IP du client (Vercel renseigne ces en-têtes). */
export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return ip.slice(0, 64);
}

const MAX_IP_FAILURES = 20;

/** Trop d'échecs de connexion depuis la même adresse IP sur 15 minutes ? (en cas d'erreur SQL, on ne bloque pas) */
export async function isIpThrottled(ip: string) {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT COUNT(*)::int AS count FROM login_attempts
      WHERE ip = ${ip} AND created_at > NOW() - INTERVAL '15 minutes'
    `;
    return Number(rows[0]?.count) >= MAX_IP_FAILURES;
  } catch {
    return false;
  }
}

export async function recordFailedAttempt(ip: string) {
  try {
    const sql = getSql();
    await sql`INSERT INTO login_attempts (ip) VALUES (${ip})`;
    await sql`DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL '1 day'`;
  } catch {
    // Migration 0002 pas encore exécutée : on ignore.
  }
}
