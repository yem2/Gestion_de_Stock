import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUuid, parseBody, serverError } from "@/lib/api";
import { inventorySaveSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("inventory.view"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const lines = await sql`
      SELECT l.product_id AS "productId", p.sku, p.name,
             l.expected_quantity::int AS expected, l.counted_quantity::int AS counted
      FROM inventory_count_lines l
      JOIN products p ON p.id = l.product_id AND p.company_id = l.company_id
      WHERE l.count_id = ${id}::uuid AND l.company_id = ${auth.user.companyId}::uuid
      ORDER BY p.name ASC
    `;
    return NextResponse.json({ lines });
  } catch {
    return serverError();
  }
}

/** Enregistre les quantités comptées (uniquement tant que l'inventaire est ouvert). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("inventory.count"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  const body = await parseBody(request, inventorySaveSchema);
  if ("error" in body) return body.error;
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE inventory_count_lines l SET counted_quantity = x.counted
      FROM inventory_counts c, jsonb_to_recordset(${JSON.stringify(body.data.lines)}::jsonb) AS x("productId" bigint, counted numeric)
      WHERE c.id = ${id}::uuid AND c.company_id = ${auth.user.companyId}::uuid AND c.status = 'open'
        AND l.count_id = c.id AND l.company_id = c.company_id AND l.product_id = x."productId"
      RETURNING l.id
    `;
    if (rows.length === 0) return fail("Cet inventaire n’est plus modifiable.", 409);
    return NextResponse.json({ ok: true, saved: rows.length });
  } catch {
    return serverError("Impossible d’enregistrer le comptage.");
  }
}
