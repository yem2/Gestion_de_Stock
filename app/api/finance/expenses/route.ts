import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit, userCan } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { expenseFailure, fail, idempotencyKey, isForeignKey, isUnique, parseBody, serverError } from "@/lib/api";
import { expenseSchema } from "@/lib/validation";
import { notifyPermission } from "@/lib/notify";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("finance.view"));
  if ("error" in auth) return auth.error;
  const status = new URL(request.url).searchParams.get("status");
  try {
    const sql = getSql();
    const expenses = await sql`
      SELECT e.id, e.expense_number AS number, e.amount, e.description, e.expense_date AS "expenseDate", e.status,
             e.closed_reason AS "closedReason", e.created_at AS "createdAt",
             c.name AS category, m.name AS method, u.name AS "createdBy"
      FROM expenses e
      JOIN expense_categories c ON c.id = e.category_id AND c.company_id = e.company_id
      JOIN payment_methods m ON m.id = e.method_id AND m.company_id = e.company_id
      LEFT JOIN users u ON u.id = e.created_by
      WHERE e.company_id = ${auth.user.companyId}::uuid AND (${status}::text IS NULL OR e.status = ${status}::text)
      ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 200`;
    return NextResponse.json({ expenses });
  } catch {
    return serverError();
  }
}

/** Saisie d'une dépense : en attente d'approbation, ou payée tout de suite si l'utilisateur peut approuver. */
export async function POST(request: Request) {
  const auth = await authorize(request, rolesFor("expenses.write"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, expenseSchema);
  if ("error" in body) return body.error;
  const d = body.data;
  if (d.approve && !userCan(auth.user, "expenses.approve")) return fail("Vous n’avez pas le droit d’approuver une dépense.", 403);
  const idem = idempotencyKey(request);
  if ("error" in idem) return idem.error;
  const key = idem.key;
  const companyId = auth.user.companyId;

  async function replay() {
    if (!key) return null;
    const sql = getSql();
    const found = await sql`
      SELECT e.id, e.expense_number AS number, e.status FROM idempotency_keys k
      JOIN expenses e ON e.id = k.result_reference::uuid AND e.company_id = k.company_id
      WHERE k.company_id = ${companyId}::uuid AND k.key = ${key} AND k.operation = 'expense_create'`;
    return found[0] ?? null;
  }

  try {
    const previous = await replay();
    if (previous) return NextResponse.json({ expense: previous, replayed: true });
    const sql = getSql();
    const rows = await sql`
      WITH r AS (
        SELECT create_expense(${companyId}::uuid, ${auth.user.id}::bigint, ${d.categoryId}::uuid, ${d.amount}::numeric, ${d.description}::text,
                              ${d.expenseDate ?? null}::date, ${d.methodId}::uuid, ${d.approve === true}::boolean) AS res
      ), k AS (
        INSERT INTO idempotency_keys (company_id, key, operation, result_reference)
        SELECT ${companyId}::uuid, ${key}::text, 'expense_create', r.res->>'id' FROM r WHERE ${key}::text IS NOT NULL
        RETURNING 1
      )
      SELECT res FROM r`;
    const res = rows[0].res as { id: string; number: string; status: string };
    await logAudit(auth.user.id, "expense_create", "expense", res.id, `${res.number} ${d.amount}`);
    if (res.status === "pending") {
      await notifyPermission(companyId, "expenses.approve", { type: "expense_approval", title: "Dépense à approuver", body: `${res.number} · ${new Intl.NumberFormat("fr-FR").format(Math.round(d.amount))} FCFA : ${d.description}`, link: "/finance", severity: "info", dedupeKey: `exp:${res.id}` });
    }
    return NextResponse.json({ expense: res }, { status: 201 });
  } catch (error) {
    if (isUnique(error) && key) {
      const previous = await replay().catch(() => null);
      if (previous) return NextResponse.json({ expense: previous, replayed: true });
    }
    if (isForeignKey(error)) return fail("Catégorie ou mode de paiement invalide.", 400);
    return expenseFailure(error) ?? serverError("Impossible d’enregistrer la dépense.");
  }
}
