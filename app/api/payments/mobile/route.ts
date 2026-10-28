import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, idempotencyKey, isForeignKey, isUnique, parseBody, paymentFailure, serverError } from "@/lib/api";
import { mobilePaymentSchema } from "@/lib/validation";
import { isConfigured, mtnRequestToPay, newExternalId, normalizeCameroonPhone, orangeInit, ProviderError, providerStatus } from "@/lib/payments/mobile";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Encaissement d'une vente par Orange Money ou MTN MoMo.
 * 1) le paiement est créé « en attente » (montant réservé sur la vente) avec sa session, en une seule transaction ;
 * 2) la demande part chez l'opérateur ; 3) le règlement final vient de la relecture du statut chez l'opérateur.
 */
export async function POST(request: Request) {
  const auth = await authorize(request, rolesFor("payments.write"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, mobilePaymentSchema);
  if ("error" in body) return body.error;
  const d = body.data;

  if (!isConfigured(d.provider)) {
    const missing = providerStatus()[d.provider].missing.join(", ");
    return fail(`Ce mode de paiement n’est pas encore connecté. Variables à renseigner : ${missing}.`, 503);
  }
  const total = d.allocations.reduce((sum, a) => sum + a.amount, 0);
  if (Math.round(total * 100) !== Math.round(d.amount * 100)) return fail("Le montant doit correspondre à la somme affectée aux ventes.", 400);

  let phone: string | null = null;
  if (d.provider === "mtn_money") {
    try {
      phone = normalizeCameroonPhone(d.phone ?? "");
    } catch (error) {
      return fail(error instanceof ProviderError ? error.message : "Numéro invalide.", 400);
    }
  }

  const idem = idempotencyKey(request);
  if ("error" in idem) return idem.error;
  const key = idem.key;
  const companyId = auth.user.companyId;
  const externalId = newExternalId(d.provider);
  const allocations = JSON.stringify(d.allocations);
  const reference = d.reference?.trim() ? d.reference.trim() : null;

  async function replay() {
    if (!key) return null;
    const sql = getSql();
    const found = await sql`
      SELECT p.id, p.payment_number AS number, p.status, s.payment_url AS "paymentUrl", s.provider
      FROM idempotency_keys k
      JOIN payments p ON p.id = k.result_reference::uuid AND p.company_id = k.company_id
      LEFT JOIN payment_provider_sessions s ON s.payment_id = p.id
      WHERE k.company_id = ${companyId}::uuid AND k.key = ${key} AND k.operation = 'mobile_payment_create'`;
    return found[0] ?? null;
  }

  let created: { id: string; number: string };
  try {
    const previous = await replay();
    if (previous) return NextResponse.json({ payment: { id: previous.id, number: previous.number, status: previous.status, paymentUrl: previous.paymentUrl }, replayed: true });
    const sql = getSql();
    const rows = await sql`
      WITH r AS (
        SELECT record_payment(
          ${companyId}::uuid, ${auth.user.id}::bigint, 'in', ${d.customerId ?? null}::bigint, NULL::bigint, ${d.amount}::numeric,
          (SELECT m.id FROM payment_methods m WHERE m.company_id = ${companyId}::uuid AND m.code = ${d.provider}::text AND m.status = 'active'),
          ${reference}::text, NULL::text, ${allocations}::jsonb, 'pending', ${d.provider}::text, ${externalId}::text
        ) AS res
      ), s AS (
        INSERT INTO payment_provider_sessions (company_id, payment_id, provider, external_id, phone)
        SELECT ${companyId}::uuid, (r.res->>'id')::uuid, ${d.provider}::text, ${externalId}::text, ${phone}::text FROM r
        RETURNING 1
      ), k AS (
        INSERT INTO idempotency_keys (company_id, key, operation, result_reference)
        SELECT ${companyId}::uuid, ${key}::text, 'mobile_payment_create', r.res->>'id' FROM r WHERE ${key}::text IS NOT NULL
        RETURNING 1
      )
      SELECT res FROM r`;
    created = rows[0].res as { id: string; number: string };
  } catch (error) {
    if (isUnique(error) && key) {
      const previous = await replay().catch(() => null);
      if (previous) return NextResponse.json({ payment: { id: previous.id, number: previous.number, status: previous.status, paymentUrl: previous.paymentUrl }, replayed: true });
    }
    if (isForeignKey(error)) return fail("Client invalide.", 400);
    return paymentFailure(error) ?? serverError("Impossible de préparer l’encaissement.");
  }

  const sql = getSql();
  try {
    let paymentUrl: string | null = null;
    if (d.provider === "mtn_money" && phone) {
      await mtnRequestToPay({ referenceId: externalId, amount: d.amount, phone, message: `Paiement ${created.number}` });
      await sql`UPDATE payment_provider_sessions SET last_status = 'pending' WHERE payment_id = ${created.id}::uuid`;
    } else {
      const order = await orangeInit({ orderId: externalId, amount: d.amount, reference: created.number });
      paymentUrl = order.paymentUrl;
      await sql`
        UPDATE payment_provider_sessions SET last_status = 'pending', pay_token = ${order.payToken}, notif_token = ${order.notifToken ?? null}, payment_url = ${order.paymentUrl}
        WHERE payment_id = ${created.id}::uuid`;
    }
    await logAudit(auth.user.id, "mobile_payment_start", "payment", created.id, `${d.provider} ${d.amount}`);
    return NextResponse.json({ payment: { id: created.id, number: created.number, status: "pending", paymentUrl } }, { status: 202 });
  } catch (error) {
    // La demande n'est pas partie : on libère le montant réservé.
    const message = error instanceof ProviderError ? error.message : "La demande n’a pas pu être envoyée à l’opérateur.";
    try {
      // La fonction est appelée depuis la clause FROM : une sous-requête non utilisée ne serait pas exécutée.
      await sql`
        UPDATE payment_provider_sessions s SET last_status = 'failed', last_error = ${message}
        FROM (SELECT settle_pending_payment(${companyId}::uuid, ${created.id}::uuid, FALSE, NULL::text) AS st) r
        WHERE s.payment_id = ${created.id}::uuid`;
    } catch {
      // Le rapprochement quotidien réglera ce paiement en attente.
    }
    return fail(message, 502);
  }
}
