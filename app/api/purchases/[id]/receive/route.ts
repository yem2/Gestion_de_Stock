import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, parseId, serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Réception : la commande passe à « received », le stock augmente et les entrées sont tracées, en une requête. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("purchases.receive"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const rows = await sql`
      WITH o AS (
        UPDATE purchase_orders SET status = 'received', received_at = NOW()
        WHERE id = ${id} AND company_id = ${auth.user.companyId}::uuid AND status = 'ordered' RETURNING id, supplier_id
      ), agg AS (
        SELECT product_id, SUM(quantity)::int AS q FROM purchase_order_items WHERE order_id = ${id} GROUP BY product_id
      ), upd AS (
        UPDATE products p SET quantity = p.quantity + a.q, updated_at = NOW()
        FROM agg a WHERE p.id = a.product_id AND EXISTS (SELECT 1 FROM o)
        RETURNING p.id, a.q
      ), mov AS (
        INSERT INTO stock_movements (company_id, product_id, movement_type, quantity, note, user_id, supplier_id)
        SELECT ${auth.user.companyId}::uuid, upd.id, 'in', upd.q, 'Réception commande #' || ${id}::text, ${auth.user.id}::bigint, (SELECT supplier_id FROM o)
        FROM upd RETURNING 1
      )
      SELECT (SELECT id FROM o) AS id
    `;
    if (rows[0]?.id == null) return fail("Commande introuvable ou déjà traitée.", 409);
    await logAudit(auth.user.id, "purchase_receive", "purchase", id);
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Impossible d’enregistrer la réception.");
  }
}
