import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, idempotencyKey, isForeignKey, isUnique, parseBody, paymentFailure, serverError } from "@/lib/api";
import { paymentSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("payments.view"));
  if ("error" in auth) return auth.error;
  const params = new URL(request.url).searchParams;
  const direction = params.get("direction");
  const status = params.get("status");
  try {
    const sql = getSql();
    const payments = await sql`
      SELECT p.id, p.payment_number AS number, p.direction, p.status, p.amount, p.reference, p.provider, p.note,
             p.paid_at AS "paidAt", p.reversal_reason AS "reversalReason",
             m.name AS method, m.code AS "methodCode", COALESCE(c.name, s.name) AS party, u.name AS "createdBy",
             COALESCE((SELECT SUM(a.allocated_amount) FROM payment_allocations a WHERE a.payment_id = p.id), 0) AS allocated
      FROM payments p
      JOIN payment_methods m ON m.id = p.method_id AND m.company_id = p.company_id
      LEFT JOIN customers c ON c.id = p.customer_id AND c.company_id = p.company_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.company_id = p.company_id
      LEFT JOIN users u ON u.id = p.created_by
      WHERE p.company_id = ${auth.user.companyId}::uuid
        AND (${direction}::text IS NULL OR p.direction = ${direction}::text)
        AND (${status}::text IS NULL OR p.status = ${status}::text)
      ORDER BY p.created_at DESC
      LIMIT 200
    `;
    return NextResponse.json({ payments });
  } catch {
    return serverError();
  }
}

/**
 * Encaissement (direction « in ») ou règlement (« out »), affecté à des ventes ou des commandes.
 * Tout se passe dans la fonction SQL record_payment ; la clé d'idempotence est enregistrée dans la même instruction.
 */
export async function POST(request: Request) {
  const auth = await authorize(request, rolesFor("payments.write"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, paymentSchema);
  if ("error" in body) return body.error;
  const d = body.data;
  if (d.direction === "in" && d.supplierId) return fail("Un encaissement ne concerne pas un fournisseur.", 400);
  if (d.direction === "out" && d.customerId) return fail("Un règlement ne concerne pas un client.", 400);
  const idem = idempotencyKey(request);
  if ("error" in idem) return idem.error;
  const key = idem.key;
  const companyId = auth.user.companyId;
  const reference = d.reference?.trim() ? d.reference.trim() : null;
  const note = d.note?.trim() ? d.note.trim() : null;
  const allocations = JSON.stringify(d.allocations ?? []);

  async function replay() {
    if (!key) return null;
    const sql = getSql();
    const found = await sql`
      SELECT p.id, p.payment_number AS number FROM idempotency_keys k
      JOIN payments p ON p.id = k.result_reference::uuid AND p.company_id = k.company_id
      WHERE k.company_id = ${companyId}::uuid AND k.key = ${key} AND k.operation = 'payment_create'
    `;
    return found[0] ?? null;
  }

  try {
    const previous = await replay();
    if (previous) return NextResponse.json({ payment: { id: previous.id, number: previous.number }, replayed: true });
    const sql = getSql();
    const rows = await sql`
      WITH r AS (
        SELECT record_payment(
          ${companyId}::uuid, ${auth.user.id}::bigint, ${d.direction}::text, ${d.customerId ?? null}::bigint, ${d.supplierId ?? null}::bigint,
          ${d.amount}::numeric, ${d.methodId}::uuid, ${reference}::text, ${note}::text, ${allocations}::jsonb
        ) AS res
      ), k AS (
        INSERT INTO idempotency_keys (company_id, key, operation, result_reference)
        SELECT ${companyId}::uuid, ${key}::text, 'payment_create', r.res->>'id' FROM r WHERE ${key}::text IS NOT NULL
        RETURNING 1
      )
      SELECT res FROM r
    `;
    const res = rows[0]?.res as { id: string; number: string; allocated: number };
    await logAudit(auth.user.id, "payment_record", "payment", res.id, `${d.direction} ${d.amount}`);
    return NextResponse.json({ payment: { id: res.id, number: res.number, allocated: res.allocated } }, { status: 201 });
  } catch (error) {
    if (isUnique(error) && key) {
      const previous = await replay().catch(() => null);
      if (previous) return NextResponse.json({ payment: { id: previous.id, number: previous.number }, replayed: true });
    }
    if (isForeignKey(error)) return fail("Client ou fournisseur invalide.", 400);
    return paymentFailure(error) ?? serverError("Impossible d’enregistrer le paiement.");
  }
}
