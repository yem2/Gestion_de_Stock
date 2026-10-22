import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUuid, serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Stock détenu par un entrepôt (produits non archivés ayant une quantité positive). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("warehouses.view"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const stock = await sql`
      SELECT p.id, p.sku, p.name, b.quantity_on_hand::int AS "onHand",
             (b.quantity_on_hand - b.quantity_reserved)::int AS available
      FROM stock_balances b
      JOIN products p ON p.id = b.product_id AND p.company_id = b.company_id
      WHERE b.company_id = ${auth.user.companyId}::uuid AND b.warehouse_id = ${id}::uuid
        AND b.quantity_on_hand > 0 AND p.archived = FALSE
      ORDER BY p.name ASC
    `;
    return NextResponse.json({ stock });
  } catch {
    return serverError();
  }
}
