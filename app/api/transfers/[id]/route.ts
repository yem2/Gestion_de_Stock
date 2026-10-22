import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUuid, serverError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("transfers.view"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const lines = await sql`
      SELECT l.id, l.product_id AS "productId", p.sku, p.name,
             l.quantity_requested::int AS requested, l.quantity_shipped::int AS shipped, l.quantity_received::int AS received
      FROM stock_transfer_lines l
      JOIN products p ON p.id = l.product_id AND p.company_id = l.company_id
      WHERE l.transfer_id = ${id}::uuid AND l.company_id = ${auth.user.companyId}::uuid
      ORDER BY p.name ASC
    `;
    return NextResponse.json({ lines });
  } catch {
    return serverError();
  }
}
