import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { expenseFailure, fail, isUuid, parseBody, serverError } from "@/lib/api";
import { expenseCloseSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Rejette une dépense en attente, ou annule une dépense payée (son règlement est alors contrepassé). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("expenses.approve"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  const body = await parseBody(request, expenseCloseSchema);
  if ("error" in body) return body.error;
  try {
    const sql = getSql();
    const rows = await sql`SELECT close_expense(${auth.user.companyId}::uuid, ${id}::uuid, ${auth.user.id}::bigint, ${body.data.reason}::text) AS status`;
    await logAudit(auth.user.id, "expense_close", "expense", id, body.data.reason);
    return NextResponse.json({ ok: true, status: rows[0]?.status });
  } catch (error) {
    return expenseFailure(error) ?? serverError("Impossible de clôturer la dépense.");
  }
}
