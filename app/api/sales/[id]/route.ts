import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, parseId, serverError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("sales.view"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const sales = await sql`
      SELECT s.id, s.status, s.total_amount AS total, s.payment_method AS "paymentMethod",
             s.created_at AS "createdAt", c.name AS "customerName", u.name AS "userName"
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.id = ${id} AND s.company_id = ${auth.user.companyId}::uuid
    `;
    if (!sales[0]) return fail("Vente introuvable.", 404);
    const items = await sql`
      SELECT p.name, p.sku, i.quantity, i.unit_price AS "unitPrice"
      FROM sale_items i JOIN products p ON p.id = i.product_id
      WHERE i.sale_id = ${id} ORDER BY i.id ASC
    `;
    return NextResponse.json({ sale: sales[0], items });
  } catch {
    return serverError();
  }
}
