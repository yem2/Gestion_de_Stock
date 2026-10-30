import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { expenseFailure, fail, isUuid, serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Approuve une dépense en attente : le règlement est créé et la trésorerie diminue, dans la même transaction. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("expenses.approve"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    await sql`SELECT approve_expense(${auth.user.companyId}::uuid, ${id}::uuid, ${auth.user.id}::bigint)`;
    await logAudit(auth.user.id, "expense_approve", "expense", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return expenseFailure(error) ?? serverError("Impossible d’approuver la dépense.");
  }
}
