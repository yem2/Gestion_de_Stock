import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { serverError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("finance.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const categories = await sql`SELECT id, name FROM expense_categories WHERE company_id = ${auth.user.companyId}::uuid AND status = 'active' ORDER BY name`;
    return NextResponse.json({ categories });
  } catch {
    return serverError();
  }
}
