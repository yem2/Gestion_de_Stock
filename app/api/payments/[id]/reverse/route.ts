import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUuid, parseBody, paymentFailure, serverError } from "@/lib/api";
import { paymentReverseSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Un paiement validé n'est jamais supprimé : il est contrepassé, avec son motif (7.6). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("payments.reverse"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  const body = await parseBody(request, paymentReverseSchema);
  if ("error" in body) return body.error;
  try {
    const sql = getSql();
    await sql`SELECT reverse_payment(${auth.user.companyId}::uuid, ${id}::uuid, ${auth.user.id}::bigint, ${body.data.reason}::text)`;
    await logAudit(auth.user.id, "payment_reverse", "payment", id, body.data.reason);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return paymentFailure(error) ?? serverError("Impossible de contrepasser le paiement.");
  }
}
