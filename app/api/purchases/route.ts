import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isForeignKey, parseBody, serverError } from "@/lib/api";
import { purchaseSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("purchases.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const purchases = await sql`
      SELECT o.id, o.order_number AS "orderNumber", o.status, o.total_cost AS total, o.note, o.created_at AS "createdAt", o.received_at AS "receivedAt",
             s.name AS "supplierName", u.name AS "userName",
             (SELECT COALESCE(SUM(quantity), 0)::int FROM purchase_order_items WHERE order_id = o.id) AS "itemCount"
      FROM purchase_orders o
      LEFT JOIN suppliers s ON s.id = o.supplier_id
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.company_id = ${auth.user.companyId}::uuid
      ORDER BY o.created_at DESC, o.id DESC LIMIT 300
    `;
    return NextResponse.json({ purchases });
  } catch {
    return serverError();
  }
}

/** Création d'une commande fournisseur : la commande et ses lignes sont enregistrées en une seule requête. */
export async function POST(request: Request) {
  const auth = await authorize(request, rolesFor("purchases.write"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, purchaseSchema);
  if ("error" in body) return body.error;
  const { supplierId, note, items } = body.data;
  const initialStatus = body.data.requireApproval ? "draft" : "ordered";
  const text = note?.trim() ? note.trim() : null;
  const itemsJson = JSON.stringify(
    items.map((item) => ({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost }))
  );

  try {
    const sql = getSql();
    const rows = await sql`
      WITH items AS (
        SELECT (e->>'productId')::bigint AS product_id, (e->>'quantity')::int AS qty, (e->>'unitCost')::numeric AS cost
        FROM jsonb_array_elements(${itemsJson}::jsonb) e
      ), valid AS (
        SELECT i.* FROM items i JOIN products p ON p.id = i.product_id AND p.archived = FALSE AND p.company_id = ${auth.user.companyId}::uuid
      ), ok AS (
        SELECT ((SELECT COUNT(*) FROM valid) = (SELECT COUNT(*) FROM items)) AS good
      ), seq AS (
        INSERT INTO document_sequences (company_id, document_type, period, next_value)
        SELECT ${auth.user.companyId}::uuid, 'purchase_order', to_char(now(), 'YYYY'), 2
        WHERE (SELECT good FROM ok)
        ON CONFLICT (company_id, document_type, period)
        DO UPDATE SET next_value = document_sequences.next_value + 1
        RETURNING period, next_value - 1 AS n
      ), ord AS (
        INSERT INTO purchase_orders (company_id, supplier_id, note, total_cost, user_id, status, order_number)
        SELECT ${auth.user.companyId}::uuid, ${supplierId ?? null}::bigint, ${text}::text,
               COALESCE((SELECT SUM(qty * cost) FROM valid), 0), ${auth.user.id}::bigint, ${initialStatus}::text,
               'CA-' || seq.period || '-' || lpad(seq.n::text, 5, '0')
        FROM seq
        WHERE (SELECT good FROM ok)
        RETURNING id, total_cost, order_number
      ), lines AS (
        INSERT INTO purchase_order_items (order_id, product_id, quantity, unit_cost)
        SELECT ord.id, v.product_id, v.qty, v.cost FROM ord, valid v
        RETURNING 1
      )
      SELECT (SELECT id FROM ord) AS id, (SELECT total_cost FROM ord) AS total, (SELECT order_number FROM ord) AS number
    `;
    if (rows[0]?.id == null) return fail("Commande impossible : produit introuvable.", 409);
    await logAudit(auth.user.id, "purchase_create", "purchase", Number(rows[0].id), String(rows[0].total));
    return NextResponse.json({ purchase: { id: rows[0].id, total: rows[0].total, number: rows[0].number } }, { status: 201 });
  } catch (error) {
    if (isForeignKey(error)) return fail("Fournisseur invalide.", 400);
    return serverError("Impossible d’enregistrer la commande.");
  }
}
