import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Modes de paiement actifs de l'entreprise. */
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const methods = await sql`
      SELECT id, code, name, type FROM payment_methods
      WHERE company_id = ${auth.user.companyId}::uuid AND status = 'active'
      ORDER BY CASE type WHEN 'cash' THEN 0 WHEN 'mobile_money' THEN 1 WHEN 'card' THEN 2 ELSE 3 END, name ASC
    `;
    return NextResponse.json({ methods });
  } catch {
    return serverError();
  }
}
