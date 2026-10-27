import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { DB_PERMISSIONS, ROLES, ROLE_LABELS, can, isRole, type Permission, type PermissionGuard, type Role } from "@/lib/roles";

export { ROLES, ROLE_LABELS, isRole };
export type { Role };

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
  /** Entreprise active de la session (appartenance active). Toutes les requêtes métier doivent la filtrer. */
  companyId: string;
  /** Codes de permission issus des rôles RBAC de l'utilisateur (base de données), relus à chaque requête. */
  permissions: string[];
};


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
    // Une seule requête : utilisateur + entreprise active (appartenance active, entreprise active).
    const rows = await sql`
      SELECT u.id, u.email, u.name, u.role, u.active, u.token_version AS "tokenVersion", m.company_id AS "companyId",
             COALESCE((
               SELECT array_agg(DISTINCT p.code)
               FROM membership_roles mr
               JOIN roles r ON r.id = mr.role_id
               JOIN role_permissions rp ON rp.role_id = r.id
               JOIN permissions p ON p.id = rp.permission_id
               WHERE mr.membership_id = m.id
             ), ARRAY[]::text[]) AS permissions
      FROM users u
      JOIN company_memberships m ON m.user_id = u.id AND m.status = 'active'
      JOIN companies c ON c.id = m.company_id AND c.status = 'active'
      WHERE u.id = ${parsed.userId}
      ORDER BY m.created_at ASC
      LIMIT 1
    `;
    const row = rows[0];
    if (!row || !row.active || row.tokenVersion !== parsed.tokenVersion || !isRole(row.role)) return null;
    return {
      id: Number(row.id), email: String(row.email), name: String(row.name), role: row.role,
      companyId: String(row.companyId),
      permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : []
    };
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
 * Les permissions viennent de la base (rôles RBAC de l'utilisateur). Si aucun rôle RBAC n'est affecté
 * à l'utilisateur, on retombe sur son rôle historique (users.role) pour ne jamais verrouiller un compte existant.
 */
function isAllowed(user: SessionUser, allowed: PermissionGuard) {
  return allowed.permission ? userCan(user, allowed.permission) : allowed.includes(user.role);
}

/** Droit de l'utilisateur pour une permission de l'application (base de données, sinon rôle historique). */
export function userCan(user: SessionUser, permission: Permission) {
  if (user.permissions.length > 0) {
    return DB_PERMISSIONS[permission].every((code) => user.permissions.includes(code));
  }
  return can(user.role, permission);
}

/**
 * Contrôle d'accès des routes API : session valide, rôle autorisé, origine identique pour les écritures.
 */
export async function authorize(
  request: Request,
  allowed?: PermissionGuard
): Promise<{ user: SessionUser } | { error: NextResponse }> {
  if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request)) {
    return { error: NextResponse.json({ error: "Origine non autorisée." }, { status: 403 }) };
  }
  const user = await getSessionUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Authentification requise." }, { status: 401 }) };
  }
  if (allowed && !isAllowed(user, allowed)) {
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
      INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, detail)
      VALUES (
        (SELECT company_id FROM company_memberships WHERE user_id = ${userId}::bigint AND status = 'active' ORDER BY created_at ASC LIMIT 1),
        ${userId}, ${action}, ${entity ?? null}, ${entityId === undefined ? null : String(entityId)}, ${detail ?? null}
      )
    `;
  } catch {
    // Le journal ne doit jamais bloquer l'action principale.
  }
}

export async function hasUsers() {
  try {
    const rows = await getSql()`SELECT COUNT(*)::int AS count FROM users`;
    return Number(rows[0]?.count) > 0;
  } catch {
    return true;
  }
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Jeton de réinitialisation : seule son empreinte est stockée en base. */
export function newResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
