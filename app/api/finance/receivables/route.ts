import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Créances clients : ventes terminées avec un reste dû, calculé depuis les paiements sources. */
export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("payments.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const receivables = await sql`
      SELECT b.sale_id AS id, b.customer_id AS "customerId", c.name AS customer, c.credit_limit AS "creditLimit",
             b.total, b.paid, b.pending, b.due, b.created_at AS "createdAt"
      FROM sale_balances b
      LEFT JOIN customers c ON c.id = b.customer_id AND c.company_id = b.company_id
      WHERE b.company_id = ${auth.user.companyId}::uuid AND b.status = 'completed' AND b.due > 0
      ORDER BY b.created_at ASC
      LIMIT 500
    `;
    return NextResponse.json({ receivables });
  } catch {
    return serverError();
  }
}
