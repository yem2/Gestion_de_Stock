import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUuid, serverError } from "@/lib/api";
import { findSession, refreshSession } from "@/lib/payments/sessions";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Statut d'un encaissement mobile ; relit l'opérateur tant que le paiement est en attente. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("payments.view"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  try {
    const session = await findSession({ paymentId: id, companyId: auth.user.companyId });
    if (!session) return fail("Encaissement introuvable.", 404);
    const remote = await refreshSession(session);
    const sql = getSql();
    const rows = await sql`
      SELECT p.status, s.payment_url AS "paymentUrl", s.last_error AS error
      FROM payments p JOIN payment_provider_sessions s ON s.payment_id = p.id
      WHERE p.id = ${id}::uuid AND p.company_id = ${auth.user.companyId}::uuid`;
    return NextResponse.json({ status: rows[0]?.status ?? "pending", remote, paymentUrl: rows[0]?.paymentUrl ?? null, error: rows[0]?.error ?? null });
  } catch {
    return serverError();
  }
}
