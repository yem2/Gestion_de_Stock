#!/usr/bin/env node
/**
 * Lanceur de migrations : applique les fichiers db/*.sql pas encore appliqués, dans l'ordre, et note le résultat
 * dans la table schema_migrations (plus de saisie manuelle dans Neon, plus de risque de rejouer un fichier).
 *
 *   npm run migrate            applique les migrations en attente
 *   npm run migrate:status     affiche l'état de chaque fichier (sans rien modifier)
 *   node scripts/migrate.mjs --dry-run   liste ce qui serait appliqué
 *   node scripts/migrate.mjs --check     échoue (code 1) s'il reste des migrations en attente
 *   node scripts/migrate.mjs --if-enabled   utilisé au déploiement : ne fait rien sauf si RUN_MIGRATIONS=1 (production uniquement)
 *
 * Base déjà migrée à la main : au premier lancement, les fichiers jusqu'à BASELINE sont simplement marqués « déjà appliqués »
 * (rien n'est rejoué), après vérification que la base est bien à ce niveau.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { directUrl } from "./db-url.mjs";

const BASELINE = "0017_mobile_money_sessions.sql"; // dernier fichier appliqué à la main sur les bases existantes
const BASELINE_PROOF = "payment_provider_sessions"; // table créée par ce fichier : preuve que la base est à ce niveau
const LOCK_KEY = 727274; // verrou : une seule exécution à la fois (deux déploiements simultanés)

const args = new Set(process.argv.slice(2));
const dir = path.resolve(process.env.MIGRATIONS_DIR || "db");

const log = (message) => console.log(`[migrations] ${message}`);
const sha = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

if (args.has("--if-enabled")) {
  const onVercel = Boolean(process.env.VERCEL);
  if (process.env.RUN_MIGRATIONS !== "1") { log("automatiques désactivées (définissez RUN_MIGRATIONS=1 sur Vercel pour les activer)."); process.exit(0); }
  if (onVercel && process.env.VERCEL_ENV !== "production") { log(`ignorées hors production (environnement : ${process.env.VERCEL_ENV}).`); process.exit(0); }
}

const rawUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!rawUrl) { console.error("[migrations] DATABASE_URL absente : impossible de continuer."); process.exit(1); }

const files = readdirSync(dir).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
if (files.length === 0) { console.error(`[migrations] aucun fichier .sql dans ${dir}`); process.exit(1); }
const contents = new Map(files.map((name) => [name, readFileSync(path.join(dir, name), "utf8")]));

const client = new pg.Client({ connectionString: directUrl(rawUrl), connectionTimeoutMillis: 20000 });
let locked = false;

async function main() {
  await client.connect();

  const wait = Date.now();
  while (!(locked = (await client.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY])).rows[0].ok)) {
    if (Date.now() - wait > 120000) throw new Error("une autre exécution des migrations dure depuis plus de 2 minutes");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), baseline boolean NOT NULL DEFAULT false)`);
  let applied = new Map((await client.query("SELECT name, checksum FROM schema_migrations")).rows.map((r) => [r.name, r.checksum]));

  // Base existante migrée à la main : on marque l'existant comme appliqué, sans rien rejouer.
  if (applied.size === 0) {
    const legacy = (await client.query("SELECT to_regclass('public.users') AS users, to_regclass($1) AS proof", [`public.${BASELINE_PROOF}`])).rows[0];
    if (legacy.users) {
      if (!legacy.proof) {
        throw new Error(`la base existe mais n'est pas au niveau ${BASELINE} (table ${BASELINE_PROOF} absente). Appliquez d'abord à la main les migrations manquantes.`);
      }
      const base = files.filter((name) => name <= BASELINE);
      for (const name of base) await client.query("INSERT INTO schema_migrations (name, checksum, baseline) VALUES ($1, $2, true)", [name, sha(contents.get(name))]);
      log(`base existante détectée : ${base.length} fichiers (jusqu'à ${BASELINE}) marqués comme déjà appliqués, sans être rejoués.`);
      applied = new Map(base.map((name) => [name, sha(contents.get(name))]));
    }
  }

  const pending = files.filter((name) => !applied.has(name));
  const changed = files.filter((name) => applied.has(name) && applied.get(name) !== sha(contents.get(name)));

  if (args.has("--status")) {
    for (const name of files) console.log(`${(applied.has(name) ? (changed.includes(name) ? "modifié" : "appliqué") : "EN ATTENTE").padEnd(10)} ${name}`);
    log(`${files.length - pending.length} appliquée(s), ${pending.length} en attente.`);
    return 0;
  }
  for (const name of changed) log(`attention : ${name} a été modifié depuis son application (il n'est pas rejoué).`);
  if (pending.length === 0) { log("base à jour, rien à appliquer."); return 0; }
  if (args.has("--check")) { log(`${pending.length} migration(s) en attente : ${pending.join(", ")}`); return 1; }
  if (args.has("--dry-run")) { pending.forEach((name) => log(`serait appliquée : ${name}`)); return 0; }

  for (const name of pending) {
    const sql = contents.get(name);
    const ownTransaction = /^\s*(BEGIN|START TRANSACTION|COMMIT)\b/im.test(sql);
    const started = Date.now();
    try {
      if (!ownTransaction) await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, sha(sql)]);
      if (!ownTransaction) await client.query("COMMIT");
    } catch (error) {
      if (!ownTransaction) await client.query("ROLLBACK").catch(() => undefined);
      console.error(`[migrations] ÉCHEC de ${name} : ${error.message}`);
      console.error("[migrations] rien n'a été enregistré pour ce fichier ; les suivants ne sont pas appliqués.");
      return 1;
    }
    log(`appliquée : ${name} (${Date.now() - started} ms)`);
  }
  log(`${pending.length} migration(s) appliquée(s).`);
  return 0;
}

let code = 1;
try { code = await main(); }
catch (error) { console.error(`[migrations] erreur : ${error.message}`); }
finally {
  if (locked) await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
  await client.end().catch(() => undefined);
}
process.exit(code);
