import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Dettes fournisseurs : commandes passées (ou reçues) avec un reste à payer. */
export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("payments.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const payables = await sql`
      SELECT b.order_id AS id, o.order_number AS "orderNumber", b.supplier_id AS "supplierId", s.name AS supplier,
             b.total, b.paid, b.pending, b.due, b.status, b.created_at AS "createdAt"
      FROM purchase_balances b
      JOIN purchase_orders o ON o.id = b.order_id AND o.company_id = b.company_id
      LEFT JOIN suppliers s ON s.id = b.supplier_id AND s.company_id = b.company_id
      WHERE b.company_id = ${auth.user.companyId}::uuid
        AND b.status IN ('ordered', 'partially_received', 'received') AND b.due > 0
      ORDER BY b.created_at ASC
      LIMIT 500
    `;
    return NextResponse.json({ payables });
  } catch {
    return serverError();
  }
}
