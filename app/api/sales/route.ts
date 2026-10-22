import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { MAIN_WAREHOUSE_STOCK_ERROR, fail, isCheckViolation, isForeignKey, parseBody, serverError } from "@/lib/api";
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
             (SELECT COALESCE(SUM(quantity), 0)::int FROM sale_items WHERE sale_id = s.id) AS "itemCount"
      FROM sales s
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
  const { customerId, paymentMethod, items } = body.data;
  const itemsJson = JSON.stringify(items.map((item) => ({ productId: item.productId, quantity: item.quantity })));

  try {
    const sql = getSql();
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
                AND NOT EXISTS (SELECT 1 FROM locked WHERE quantity < qty)) AS good
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
      )
      SELECT (SELECT id FROM sale) AS id, (SELECT total_amount FROM sale) AS total
    `;
    if (rows[0]?.id == null) {
      return fail("Vente impossible : stock insuffisant ou produit introuvable.", 409);
    }
    await logAudit(auth.user.id, "sale_create", "sale", Number(rows[0].id), String(rows[0].total));
    return NextResponse.json({ sale: { id: rows[0].id, total: rows[0].total } }, { status: 201 });
  } catch (error) {
    if (isForeignKey(error)) return fail("Client invalide.", 400);
    if (isCheckViolation(error)) return fail(MAIN_WAREHOUSE_STOCK_ERROR, 409);
    return serverError("Impossible d’enregistrer la vente.");
  }
}
