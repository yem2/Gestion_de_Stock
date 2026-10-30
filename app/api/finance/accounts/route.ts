import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Comptes de trésorerie et leur solde : ouverture + encaissements validés − règlements validés. */
export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("finance.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const accounts = await sql`
      SELECT account_id AS id, name, type, opening_balance AS "openingBalance", inflow, outflow, balance
      FROM account_balances WHERE company_id = ${auth.user.companyId}::uuid AND status = 'active'
      ORDER BY CASE type WHEN 'cash' THEN 0 WHEN 'mobile_money' THEN 1 ELSE 2 END, name`;
    return NextResponse.json({ accounts });
  } catch {
    return serverError();
  }
}
