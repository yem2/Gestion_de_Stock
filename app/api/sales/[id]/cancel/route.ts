import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, parseId, serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Annulation : la vente passe à « cancelled » et le stock vendu est remis, en une seule instruction. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("sales.cancel"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const rows = await sql`
      WITH s AS (
        UPDATE sales SET status = 'cancelled' WHERE id = ${id} AND company_id = ${auth.user.companyId}::uuid AND status = 'completed' RETURNING id
      ), restock AS (
        UPDATE products p SET quantity = p.quantity + si.q, updated_at = NOW()
        FROM (SELECT product_id, SUM(quantity)::int AS q FROM sale_items WHERE sale_id = ${id} GROUP BY product_id) si
        WHERE p.id = si.product_id AND EXISTS (SELECT 1 FROM s)
        RETURNING p.id, si.q
      ), mov AS (
        INSERT INTO stock_movements (company_id, product_id, movement_type, quantity, note, user_id)
        SELECT ${auth.user.companyId}::uuid, id, 'in', q, 'Annulation vente #' || ${id}::text, ${auth.user.id}::bigint FROM restock
        RETURNING 1
      )
      SELECT (SELECT id FROM s) AS id
    `;
    if (rows[0]?.id == null) return fail("Vente introuvable ou déjà annulée.", 409);
    await logAudit(auth.user.id, "sale_cancel", "sale", id);
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Impossible d’annuler la vente.");
  }
}
