import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { MAIN_WAREHOUSE_STOCK_ERROR, fail, idempotencyKey, isCheckViolation, isForeignKey, isUnique, parseBody, serverError } from "@/lib/api";
import { saleSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("sales.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const sales = await sql`
      SELECT s.id, s.status, s.total_amount AS total, s.payment_method AS "paymentMethod",
             s.created_at AS "createdAt", c.name AS "customerName", u.name AS "userName",
             (SELECT COALESCE(SUM(quantity), 0)::int FROM sale_items WHERE sale_id = s.id) AS "itemCount",
             COALESCE(b.due, 0) AS due
      FROM sales s
      LEFT JOIN sale_balances b ON b.sale_id = s.id AND b.company_id = s.company_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.company_id = ${auth.user.companyId}::uuid
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT 300
    `;
    return NextResponse.json({ sales });
  } catch {
    return serverError();
  }
}

/**
 * Vente atomique : les prix viennent de la base (jamais du navigateur), le stock est verrouillé,
 * vérifié puis décrémenté, et les mouvements sont enregistrés dans la même instruction.
 */
export async function POST(request: Request) {
  const auth = await authorize(request, rolesFor("sales.write"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, saleSchema);
  if ("error" in body) return body.error;
  const { customerId, paymentMethod, items, amountPaid } = body.data;
  const idem = idempotencyKey(request);
  if ("error" in idem) return idem.error;
  const key = idem.key;
  const itemsJson = JSON.stringify(items.map((item) => ({ productId: item.productId, quantity: item.quantity })));

  const companyId = auth.user.companyId;

  /** Vente déjà enregistrée avec cette clé : on renvoie le même résultat, sans rien refaire. */
  async function replay() {
    if (!key) return null;
    const sql = getSql();
    const found = await sql`
      SELECT s.id, s.total_amount AS total
      FROM idempotency_keys k
      JOIN sales s ON s.id = k.result_reference::bigint AND s.company_id = k.company_id
      WHERE k.company_id = ${companyId}::uuid AND k.key = ${key} AND k.operation = 'sale_create'
    `;
    return found[0] ?? null;
  }

  try {
    const previous = await replay();
    if (previous) return NextResponse.json({ sale: { id: previous.id, total: previous.total }, replayed: true });

    const sql = getSql();

    // Montant encaissé : le total attendu est recalculé côté serveur à partir des prix en base.
    const quote = await sql`
      SELECT COALESCE(SUM(p.unit_price * x.qty), 0) AS total
      FROM products p
      JOIN (SELECT (e->>'productId')::bigint AS pid, SUM((e->>'quantity')::int)::int AS qty FROM jsonb_array_elements(${itemsJson}::jsonb) e GROUP BY 1) x ON x.pid = p.id
      WHERE p.company_id = ${companyId}::uuid AND p.archived = FALSE
    `;
    const expectedTotal = Number(quote[0]?.total ?? 0);
    const paid = amountPaid ?? expectedTotal;
    if (paid > expectedTotal) return fail("Le montant encaissé dépasse le total de la vente.", 400);
    const due = expectedTotal - paid;
    if (due > 0) {
      if (!customerId) return fail("Une vente à crédit nécessite de choisir un client.", 400);
      const credit = await sql`
        SELECT c.credit_limit AS "limit",
               COALESCE((SELECT SUM(b.due) FROM sale_balances b WHERE b.company_id = c.company_id AND b.customer_id = c.id AND b.status = 'completed'), 0) AS outstanding
        FROM customers c WHERE c.id = ${customerId}::bigint AND c.company_id = ${companyId}::uuid
      `;
      if (!credit[0]) return fail("Client invalide.", 400);
      if (credit[0].limit !== null && Number(credit[0].outstanding) + due > Number(credit[0].limit)) {
        const fmt = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} FCFA`;
        return fail(`Plafond de crédit dépassé : ${fmt(Number(credit[0].outstanding))} déjà dus sur un plafond de ${fmt(Number(credit[0].limit))}.`, 409);
      }
    }

    const rows = await sql`
      WITH items AS (
        SELECT (e->>'productId')::bigint AS product_id, (e->>'quantity')::int AS qty
        FROM jsonb_array_elements(${itemsJson}::jsonb) e
      ), agg AS (
        SELECT product_id, SUM(qty)::int AS qty FROM items GROUP BY product_id
      ), locked AS (
        SELECT p.id, p.unit_price, p.quantity, a.qty
        FROM products p JOIN agg a ON a.product_id = p.id
        WHERE p.archived = FALSE AND p.company_id = ${auth.user.companyId}::uuid FOR UPDATE OF p
      ), ok AS (
        SELECT ((SELECT COUNT(*) FROM locked) = (SELECT COUNT(*) FROM agg)
                AND NOT EXISTS (SELECT 1 FROM locked WHERE quantity < qty)
                AND ${paid}::numeric <= COALESCE((SELECT SUM(unit_price * qty) FROM locked), 0)) AS good
      ), sale AS (
        INSERT INTO sales (company_id, customer_id, status, total_amount, user_id, payment_method)
        SELECT ${auth.user.companyId}::uuid, ${customerId ?? null}::bigint, 'completed',
               COALESCE((SELECT SUM(unit_price * qty) FROM locked), 0),
               ${auth.user.id}::bigint, ${paymentMethod}::text
        WHERE (SELECT good FROM ok)
        RETURNING id, total_amount
      ), lines AS (
        INSERT INTO sale_items (sale_id, product_id, quantity, unit_price)
        SELECT sale.id, l.id, l.qty, l.unit_price FROM sale, locked l
        RETURNING 1
      ), dec AS (
        UPDATE products p SET quantity = p.quantity - l.qty, updated_at = NOW()
        FROM locked l WHERE p.id = l.id AND EXISTS (SELECT 1 FROM sale)
        RETURNING p.id, l.qty
      ), mov AS (
        INSERT INTO stock_movements (company_id, product_id, movement_type, quantity, note, user_id)
        SELECT ${auth.user.companyId}::uuid, id, 'out', qty, 'Vente #' || (SELECT id FROM sale), ${auth.user.id}::bigint FROM dec
        RETURNING 1
      ), payseq AS (
        INSERT INTO document_sequences (company_id, document_type, period, next_value)
        SELECT ${companyId}::uuid, 'payment', to_char(now(), 'YYYY'), 2
        WHERE EXISTS (SELECT 1 FROM sale) AND ${paid}::numeric > 0
        ON CONFLICT (company_id, document_type, period) DO UPDATE SET next_value = document_sequences.next_value + 1
        RETURNING period, next_value - 1 AS n
      ), pay AS (
        INSERT INTO payments (company_id, payment_number, direction, party_type, customer_id, amount, method_id, status, created_by)
        SELECT ${companyId}::uuid, 'PAY-' || payseq.period || '-' || lpad(payseq.n::text, 5, '0'), 'in',
               CASE WHEN ${customerId ?? null}::bigint IS NULL THEN 'other' ELSE 'customer' END, ${customerId ?? null}::bigint,
               ${paid}::numeric,
               (SELECT m.id FROM payment_methods m WHERE m.company_id = ${companyId}::uuid AND m.code = ${paymentMethod}::text AND m.status = 'active'),
               'posted', ${auth.user.id}::bigint
        FROM payseq
        RETURNING id, amount
      ), alloc AS (
        INSERT INTO payment_allocations (company_id, payment_id, document_type, document_id, allocated_amount)
        SELECT ${companyId}::uuid, pay.id, 'sale', (SELECT id FROM sale), pay.amount FROM pay
        RETURNING 1
      ), idem AS (
        INSERT INTO idempotency_keys (company_id, key, operation, result_reference)
        SELECT ${auth.user.companyId}::uuid, ${key}::text, 'sale_create', sale.id::text FROM sale WHERE ${key}::text IS NOT NULL
        RETURNING 1
      )
      SELECT (SELECT id FROM sale) AS id, (SELECT total_amount FROM sale) AS total
    `;
    if (rows[0]?.id == null) {
      return fail("Vente impossible : stock insuffisant ou produit introuvable.", 409);
    }
    await logAudit(auth.user.id, "sale_create", "sale", Number(rows[0].id), String(rows[0].total));
    return NextResponse.json({ sale: { id: rows[0].id, total: rows[0].total } }, { status: 201 });
  } catch (error) {
    if (isUnique(error) && key) {
      // Deux requêtes simultanées avec la même clé : la seconde est annulée en entier, on renvoie la première vente.
      const previous = await replay().catch(() => null);
      if (previous) return NextResponse.json({ sale: { id: previous.id, total: previous.total }, replayed: true });
    }
    if (isForeignKey(error)) return fail("Client invalide.", 400);
    if (isCheckViolation(error)) return fail(MAIN_WAREHOUSE_STOCK_ERROR, 409);
    return serverError("Impossible d’enregistrer la vente.");
  }
}
