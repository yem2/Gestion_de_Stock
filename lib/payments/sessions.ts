import { getSql } from "@/lib/db";
import { mtnCheck, orangeCheck, ProviderError, type MobileProvider, type RemoteStatus } from "@/lib/payments/mobile";

export type SessionRow = {
  id: string;
  companyId: string;
  paymentId: string;
  provider: MobileProvider;
  externalId: string;
  payToken: string | null;
  lastStatus: string;
  createdAt: string;
  amount: string;
  paymentStatus: string;
};

/** Demandes non réglées au-delà de cette durée : le paiement est marqué expiré. */
export const EXPIRY_MINUTES = 60;


export async function findSession(where: { paymentId: string; companyId: string } | { notifToken: string } | { provider: MobileProvider; externalId: string }) {
  const sql = getSql();
  const rows =
    "paymentId" in where
      ? await sql`
          SELECT s.id, s.company_id AS "companyId", s.payment_id AS "paymentId", s.provider, s.external_id AS "externalId",
                 s.pay_token AS "payToken", s.last_status AS "lastStatus", s.created_at AS "createdAt", p.amount, p.status AS "paymentStatus"
          FROM payment_provider_sessions s JOIN payments p ON p.id = s.payment_id AND p.company_id = s.company_id
          WHERE s.payment_id = ${where.paymentId}::uuid AND s.company_id = ${where.companyId}::uuid`
      : "notifToken" in where
        ? await sql`
            SELECT s.id, s.company_id AS "companyId", s.payment_id AS "paymentId", s.provider, s.external_id AS "externalId",
                   s.pay_token AS "payToken", s.last_status AS "lastStatus", s.created_at AS "createdAt", p.amount, p.status AS "paymentStatus"
            FROM payment_provider_sessions s JOIN payments p ON p.id = s.payment_id AND p.company_id = s.company_id
            WHERE s.notif_token = ${where.notifToken}`
        : await sql`
            SELECT s.id, s.company_id AS "companyId", s.payment_id AS "paymentId", s.provider, s.external_id AS "externalId",
                   s.pay_token AS "payToken", s.last_status AS "lastStatus", s.created_at AS "createdAt", p.amount, p.status AS "paymentStatus"
            FROM payment_provider_sessions s JOIN payments p ON p.id = s.payment_id AND p.company_id = s.company_id
            WHERE s.provider = ${where.provider} AND s.external_id = ${where.externalId}`;
  return (rows[0] as SessionRow | undefined) ?? null;
}

/**
 * Relit le statut chez l'opérateur et règle le paiement en conséquence, en une seule instruction SQL.
 * Rejouable sans risque : un paiement déjà réglé n'est jamais modifié (settle_pending_payment).
 */
export async function refreshSession(session: SessionRow): Promise<RemoteStatus> {
  if (session.paymentStatus !== "pending") {
    return session.paymentStatus === "posted" ? "success" : "failed";
  }
  let remote: { status: RemoteStatus; reference?: string; reason?: string };
  try {
    remote =
      session.provider === "mtn_money"
        ? await mtnCheck(session.externalId)
        : session.payToken
          ? await orangeCheck({ orderId: session.externalId, amount: Number(session.amount), payToken: session.payToken })
          : { status: "pending" };
  } catch (error) {
    const sql = getSql();
    const reason = error instanceof ProviderError ? error.message : "Vérification impossible.";
    await sql`UPDATE payment_provider_sessions SET last_checked_at = NOW(), last_error = ${reason} WHERE id = ${session.id}::uuid`;
    return "pending";
  }

  let status = remote.status;
  const ageMinutes = (Date.now() - new Date(session.createdAt).getTime()) / 60000;
  if (status === "pending" && ageMinutes > EXPIRY_MINUTES) status = "expired";

  const sql = getSql();
  if (status === "pending") {
    await sql`UPDATE payment_provider_sessions SET last_status = 'pending', last_checked_at = NOW(), last_error = NULL WHERE id = ${session.id}::uuid`;
    return "pending";
  }
  const success = status === "success";
  const rows = await sql`
    WITH r AS (SELECT settle_pending_payment(${session.companyId}::uuid, ${session.paymentId}::uuid, ${success}::boolean, ${remote.reference ?? null}::text) AS st)
    UPDATE payment_provider_sessions s
    SET last_status = ${status}, last_checked_at = NOW(),
        last_error = CASE WHEN ${success}::boolean AND r.st <> 'posted' THEN 'Paiement reçu mais le paiement local est ' || r.st || ' : à régulariser manuellement.' ELSE ${remote.reason ?? null}::text END
    FROM r WHERE s.id = ${session.id}::uuid
    RETURNING r.st AS "paymentStatus"
  `;
  return success && rows[0]?.paymentStatus === "posted" ? "success" : status === "success" ? "failed" : status;
}
