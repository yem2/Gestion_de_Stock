// Vérifie l'isolation multi-entreprises au niveau de la base (à lancer sur une branche Neon de test, jamais en production).
// Usage : DATABASE_URL="postgresql://..." node scripts/check-isolation.mjs
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL manquante."); process.exit(1); }
const sql = neon(url);
const tag = Math.random().toString(36).slice(2, 8);
let failures = 0;

function check(name, ok) {
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${name}`);
  if (!ok) failures += 1;
}
async function rejected(promise) {
  try { await promise; return false; } catch { return true; }
}

const a = (await sql`INSERT INTO companies (name, slug) VALUES (${"Test A " + tag}, ${"test-a-" + tag}) RETURNING id`)[0].id;
const b = (await sql`INSERT INTO companies (name, slug) VALUES (${"Test B " + tag}, ${"test-b-" + tag}) RETURNING id`)[0].id;

try {
  const pa = (await sql`INSERT INTO products (company_id, sku, name) VALUES (${a}::uuid, 'ISO-1', 'Produit A') RETURNING id`)[0].id;
  const sameSkuOk = !(await rejected(sql`INSERT INTO products (company_id, sku, name) VALUES (${b}::uuid, 'ISO-1', 'Produit B')`));
  check("deux entreprises peuvent utiliser le même SKU", sameSkuOk);
  check("SKU dupliqué dans la même entreprise refusé",
    await rejected(sql`INSERT INTO products (company_id, sku, name) VALUES (${a}::uuid, 'ISO-1', 'Doublon')`));
  check("mouvement de B sur un produit de A refusé",
    await rejected(sql`INSERT INTO stock_movements (company_id, product_id, movement_type, quantity) VALUES (${b}::uuid, ${pa}::bigint, 'in', 1)`));

  const cb = (await sql`INSERT INTO customers (company_id, name) VALUES (${b}::uuid, 'Client B') RETURNING id`)[0].id;
  check("vente de A avec un client de B refusée",
    await rejected(sql`INSERT INTO sales (company_id, customer_id, status, total_amount, payment_method) VALUES (${a}::uuid, ${cb}::bigint, 'completed', 0, 'cash')`));

  const sb = (await sql`INSERT INTO suppliers (company_id, name) VALUES (${b}::uuid, 'Fournisseur B') RETURNING id`)[0].id;
  check("commande de A avec un fournisseur de B refusée",
    await rejected(sql`INSERT INTO purchase_orders (company_id, supplier_id) VALUES (${a}::uuid, ${sb}::bigint)`));
} finally {
  for (const id of [a, b]) {
    await sql`DELETE FROM stock_movements WHERE company_id = ${id}::uuid`;
    await sql`DELETE FROM stock_balances WHERE company_id = ${id}::uuid`;
    await sql`DELETE FROM purchase_orders WHERE company_id = ${id}::uuid`;
    await sql`DELETE FROM sales WHERE company_id = ${id}::uuid`;
    await sql`DELETE FROM products WHERE company_id = ${id}::uuid`;
    await sql`DELETE FROM customers WHERE company_id = ${id}::uuid`;
    await sql`DELETE FROM suppliers WHERE company_id = ${id}::uuid`;
    await sql`DELETE FROM companies WHERE id = ${id}::uuid`;
  }
}
console.log(failures === 0 ? "\nIsolation vérifiée." : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
