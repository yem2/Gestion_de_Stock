import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const ROLES = ["super_admin", "admin", "manager", "storekeeper", "seller"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  manager: "Gestionnaire",
  storekeeper: "Magasinier",
  seller: "Vendeur"
};

const ROLE_RANK: Record<Role, number> = {
  super_admin: 4,
  admin: 3,
  manager: 2,
  storekeeper: 1,
  seller: 0
};

export const SESSION_COOKIE = "gs_session";
const SESSION_SECONDS = 60 * 60 * 8;

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function roleRank(role: Role) {
  return ROLE_RANK[role];
}

/** Un utilisateur peut gérer uniquement des rôles strictement inférieurs, sauf le super administrateur. */
export function canManageRole(actor: Role, target: Role) {
  if (actor === "super_admin") return true;
  if (actor !== "admin") return false;
  return ROLE_RANK[target] < ROLE_RANK[actor];
}

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
