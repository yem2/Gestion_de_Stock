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
      WITH blocking AS (
        -- Paiements partagés avec d'autres documents ou partiellement affectés : à contrepasser à la main d'abord.
        SELECT p.id
        FROM payment_allocations a
        JOIN payments p ON p.id = a.payment_id AND p.company_id = a.company_id
        WHERE a.company_id = ${auth.user.companyId}::uuid AND a.document_type = 'sale' AND a.document_id = ${id}
          AND p.status IN ('posted', 'pending')
          AND (p.amount <> a.allocated_amount OR EXISTS (SELECT 1 FROM payment_allocations a2 WHERE a2.payment_id = p.id AND a2.id <> a.id))
      ), s AS (
        UPDATE sales SET status = 'cancelled'
        WHERE id = ${id} AND company_id = ${auth.user.companyId}::uuid AND status = 'completed' AND NOT EXISTS (SELECT 1 FROM blocking)
        RETURNING id
      ), rev AS (
        UPDATE payments p SET status = 'reversed', reversed_at = NOW(), reversed_by = ${auth.user.id}::bigint,
               reversal_reason = 'Annulation de la vente #' || ${id}::text
        WHERE p.company_id = ${auth.user.companyId}::uuid AND p.status IN ('posted', 'pending') AND EXISTS (SELECT 1 FROM s)
          AND p.id IN (SELECT a.payment_id FROM payment_allocations a WHERE a.company_id = p.company_id AND a.document_type = 'sale' AND a.document_id = ${id})
        RETURNING 1
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
      SELECT (SELECT id FROM s) AS id, EXISTS (SELECT 1 FROM blocking) AS blocked
    `;
    if (rows[0]?.blocked) return fail("Cette vente a des paiements partagés avec d’autres documents : contrepassez-les d’abord dans Paiements.", 409);
    if (rows[0]?.id == null) return fail("Vente introuvable ou déjà annulée.", 409);
    await logAudit(auth.user.id, "sale_cancel", "sale", id);
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Impossible d’annuler la vente.");
  }
}
