import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, parseBody, serverError } from "@/lib/api";
import { movementSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("movements.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const movements = await sql`
      SELECT m.id, m.movement_type AS type, m.quantity, m.note, m.created_at AS "createdAt",
             p.name AS "productName", p.sku, s.name AS "supplierName", u.name AS "userName"
      FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      LEFT JOIN suppliers s ON s.id = m.supplier_id
      LEFT JOIN users u ON u.id = m.user_id
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 300
    `;
    return NextResponse.json({ movements });
  } catch {
    return serverError();
  }
}

/** Chaque mouvement modifie le stock et s'enregistre dans une seule instruction SQL atomique. */
export async function POST(request: Request) {
  const auth = await authorize(request, rolesFor("movements.write"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, movementSchema);
  if ("error" in body) return body.error;
  const { productId, type, quantity, note, supplierId } = body.data;
  const text = note?.trim() ? note.trim() : null;
  const supplier = type === "in" ? supplierId ?? null : null;

  try {
    const sql = getSql();
    let rows;
    if (type === "in") {
      rows = await sql`
        WITH upd AS (
          UPDATE products SET quantity = quantity + ${quantity}::int, updated_at = NOW()
          WHERE id = ${productId} AND archived = FALSE RETURNING id, quantity
        ), ins AS (
          INSERT INTO stock_movements (product_id, movement_type, quantity, note, user_id, supplier_id)
          SELECT id, 'in', ${quantity}::int, ${text}::text, ${auth.user.id}::bigint, ${supplier}::bigint FROM upd
          RETURNING id
        )
        SELECT (SELECT quantity FROM upd) AS quantity, (SELECT id FROM ins) AS "movementId"
      `;
    } else if (type === "out") {
      rows = await sql`
        WITH upd AS (
          UPDATE products SET quantity = quantity - ${quantity}::int, updated_at = NOW()
          WHERE id = ${productId} AND archived = FALSE AND quantity >= ${quantity}::int RETURNING id, quantity
        ), ins AS (
          INSERT INTO stock_movements (product_id, movement_type, quantity, note, user_id)
          SELECT id, 'out', ${quantity}::int, ${text}::text, ${auth.user.id}::bigint FROM upd
          RETURNING id
        )
        SELECT (SELECT quantity FROM upd) AS quantity, (SELECT id FROM ins) AS "movementId"
      `;
    } else {
      rows = await sql`
        WITH cur AS (
          SELECT id, quantity AS old FROM products WHERE id = ${productId} AND archived = FALSE FOR UPDATE
        ), upd AS (
          UPDATE products p SET quantity = ${quantity}::int, updated_at = NOW()
          FROM cur WHERE p.id = cur.id AND cur.old <> ${quantity}::int
          RETURNING p.id, p.quantity, cur.old
        ), ins AS (
          INSERT INTO stock_movements (product_id, movement_type, quantity, note, user_id)
          SELECT id, 'adjustment', ABS(quantity - old),
                 'Inventaire : ' || old || ' → ' || quantity || COALESCE(' — ' || ${text}::text, ''),
                 ${auth.user.id}::bigint
          FROM upd RETURNING id
        )
        SELECT (SELECT quantity FROM upd) AS quantity, (SELECT id FROM ins) AS "movementId"
      `;
    }
    if (rows[0]?.movementId == null) {
      if (type === "out") return fail("Stock insuffisant ou produit introuvable.", 409);
      if (type === "adjustment") return fail("Le stock compté est identique au stock actuel, ou le produit est introuvable.", 409);
      return fail("Produit introuvable.", 404);
    }
    await logAudit(auth.user.id, `movement_${type}`, "product", productId, String(quantity));
    return NextResponse.json({ ok: true, quantity: rows[0].quantity }, { status: 201 });
  } catch {
    return serverError("Impossible d’enregistrer le mouvement.");
  }
}
