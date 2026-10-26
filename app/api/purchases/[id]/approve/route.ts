import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, parseId, serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Soumise -> commandée (approuvée, prête à être réceptionnée). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("purchases.approve"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE purchase_orders SET status = 'ordered', approved_by = ${auth.user.id}::bigint, approved_at = NOW()
      WHERE id = ${id} AND company_id = ${auth.user.companyId}::uuid AND status = 'submitted' RETURNING id
    `;
    if (!rows[0]) return fail("Commande introuvable ou déjà traitée.", 409);
    await logAudit(auth.user.id, "purchase_approve", "purchase", id);
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Impossible d’approuver la commande.");
  }
}
