// Vérifie l'isolation multi-entreprises au niveau de la base (cahier des charges 9.3 : tests bloquants).
// À lancer sur une branche Neon de test, JAMAIS en production.
// Usage : DATABASE_URL="postgresql://..." node scripts/check-isolation.mjs
// Les contrôles liés à une migration absente (ex. 0013) sont ignorés avec la mention « ignoré ».
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL manquante."); process.exit(1); }
const sql = neon(url);
const tag = Math.random().toString(36).slice(2, 8);
let failures = 0;

function check(name, ok) {
  console.log(`${ok ? "OK    " : "ÉCHEC "} ${name}`);
  if (!ok) failures += 1;
}
function skipped(name) { console.log(`ignoré ${name}`); }
async function rejected(promise, pattern) {
  try { await promise; return false; } catch (error) {
    return pattern ? pattern.test(String(error?.message ?? error)) : true;
  }
}
async function exists(query) { return (await query).length > 0; }

const a = (await sql`INSERT INTO companies (name, slug) VALUES (${"Test A " + tag}, ${"test-a-" + tag}) RETURNING id`)[0].id;
const b = (await sql`INSERT INTO companies (name, slug) VALUES (${"Test B " + tag}, ${"test-b-" + tag}) RETURNING id`)[0].id;

try {
  // --- Catalogue et documents historiques
  const pa = (await sql`INSERT INTO products (company_id, sku, name) VALUES (${a}::uuid, 'ISO-1', 'Produit A') RETURNING id`)[0].id;
  const pb = (await sql`INSERT INTO products (company_id, sku, name) VALUES (${b}::uuid, 'ISO-1', 'Produit B') RETURNING id`)[0].id;
  check("deux entreprises peuvent utiliser le même SKU", Boolean(pb));
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

  // --- Entrepôts, transferts, inventaires (phase 3)
  const wa = (await sql`INSERT INTO warehouses (company_id, name, code) VALUES (${a}::uuid, 'Entrepôt A', 'WA') RETURNING id`)[0].id;
  const wa2 = (await sql`INSERT INTO warehouses (company_id, name, code) VALUES (${a}::uuid, 'Entrepôt A2', 'WA2') RETURNING id`)[0].id;
  const wb = (await sql`INSERT INTO warehouses (company_id, name, code) VALUES (${b}::uuid, 'Entrepôt B', 'WB') RETURNING id`)[0].id;

  check("transfert de A vers un entrepôt de B refusé",
    await rejected(sql`INSERT INTO stock_transfers (company_id, transfer_number, source_warehouse_id, destination_warehouse_id) VALUES (${a}::uuid, 'T-X', ${wa}::uuid, ${wb}::uuid)`));
  check("inventaire de A sur un entrepôt de B refusé",
    await rejected(sql`INSERT INTO inventory_counts (company_id, count_number, warehouse_id) VALUES (${a}::uuid, 'I-X', ${wb}::uuid)`));
  check("ligne de transfert sans transfert refusée",
    await rejected(sql`INSERT INTO stock_transfer_lines (company_id, transfer_id, product_id, quantity_requested) VALUES (${a}::uuid, gen_random_uuid(), ${pa}::bigint, 1)`));

  const ta = (await sql`INSERT INTO stock_transfers (company_id, transfer_number, source_warehouse_id, destination_warehouse_id) VALUES (${a}::uuid, 'T-1', ${wa}::uuid, ${wa2}::uuid) RETURNING id`)[0].id;
  check("ligne de B dans un transfert de A refusée",
    await rejected(sql`INSERT INTO stock_transfer_lines (company_id, transfer_id, product_id, quantity_requested) VALUES (${b}::uuid, ${ta}::uuid, ${pb}::bigint, 1)`));
  check("expédition du transfert de A par B refusée",
    await rejected(sql`SELECT ship_transfer(${b}::uuid, ${ta}::uuid, NULL::bigint)`, /TRANSFER_NOT_FOUND/));
  check("annulation du transfert de A par B refusée",
    await rejected(sql`SELECT cancel_transfer(${b}::uuid, ${ta}::uuid)`, /TRANSFER_NOT_FOUND/));

  const ca = (await sql`INSERT INTO inventory_counts (company_id, count_number, warehouse_id, status) VALUES (${a}::uuid, 'I-1', ${wa}::uuid, 'submitted') RETURNING id`)[0].id;
  check("approbation de l'inventaire de A par B refusée",
    await rejected(sql`SELECT approve_inventory_count(${b}::uuid, ${ca}::uuid, NULL::bigint)`, /INVENTORY_NOT_FOUND/));

  // --- Codes-barres, idempotence, numérotation
  await sql`INSERT INTO product_barcodes (company_id, product_id, barcode) VALUES (${a}::uuid, ${pa}::bigint, 'CODE-ISO'), (${b}::uuid, ${pb}::bigint, 'CODE-ISO')`;
  check("même code-barres accepté dans deux entreprises", true);
  check("code-barres de B sur un produit de A refusé",
    await rejected(sql`INSERT INTO product_barcodes (company_id, product_id, barcode) VALUES (${b}::uuid, ${pa}::bigint, 'CODE-X')`));
  check("code-barres dupliqué dans la même entreprise refusé",
    await rejected(sql`INSERT INTO product_barcodes (company_id, product_id, barcode) VALUES (${a}::uuid, ${pa}::bigint, 'CODE-ISO')`));

  await sql`INSERT INTO idempotency_keys (company_id, key, operation) VALUES (${a}::uuid, 'meme-cle-1234', 'sale_create'), (${b}::uuid, 'meme-cle-1234', 'sale_create')`;
  check("même clé d'idempotence acceptée dans deux entreprises", true);
  check("clé d'idempotence rejouée refusée",
    await rejected(sql`INSERT INTO idempotency_keys (company_id, key, operation) VALUES (${a}::uuid, 'meme-cle-1234', 'sale_create')`));

  // --- Achats (migration 0013) : ignoré si elle n'est pas appliquée
  if (await exists(sql`SELECT 1 FROM pg_proc WHERE proname = 'receive_purchase'`)) {
    const oa = (await sql`INSERT INTO purchase_orders (company_id, status, total_cost) VALUES (${a}::uuid, 'ordered', 0) RETURNING id`)[0].id;
    await sql`INSERT INTO purchase_order_items (order_id, product_id, quantity, unit_cost) VALUES (${oa}::bigint, ${pa}::bigint, 5, 10)`;
    check("réception de la commande de A par B refusée",
      await rejected(sql`SELECT receive_purchase(${b}::uuid, ${oa}::bigint, NULL::bigint, NULL::jsonb, NULL::text)`, /PURCHASE_NOT_FOUND/));
    check("bon de réception de B sur une commande de A refusé",
      await rejected(sql`INSERT INTO goods_receipts (company_id, order_id, receipt_number) VALUES (${b}::uuid, ${oa}::bigint, 'REC-X')`));
  } else {
    skipped("contrôles de réception d'achat (migration 0013 absente)");
  }
} finally {
  for (const id of [a, b]) {
    for (const statement of [
      sql`DELETE FROM goods_receipts WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM idempotency_keys WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM document_sequences WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM stock_transfers WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM inventory_counts WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM product_barcodes WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM stock_movements WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM stock_balances WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM purchase_order_items WHERE order_id IN (SELECT id FROM purchase_orders WHERE company_id = ${id}::uuid)`,
      sql`DELETE FROM purchase_orders WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM sales WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM products WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM customers WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM suppliers WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM warehouses WHERE company_id = ${id}::uuid`,
      sql`DELETE FROM companies WHERE id = ${id}::uuid`
    ]) {
      try { await statement; } catch { /* table absente (migration non appliquée) : on continue le nettoyage */ }
    }
  }
}
console.log(failures === 0 ? "\nIsolation vérifiée." : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
