import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, parseId, serverError } from "@/lib/api";
import { notifyPermission } from "@/lib/notify";

export const runtime = "nodejs";

/** Brouillon -> soumise à approbation. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("purchases.write"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE purchase_orders SET status = 'submitted', submitted_at = NOW()
      WHERE id = ${id} AND company_id = ${auth.user.companyId}::uuid AND status = 'draft' RETURNING id
    `;
    if (!rows[0]) return fail("Commande introuvable ou déjà traitée.", 409);
    await logAudit(auth.user.id, "purchase_submit", "purchase", id);
    await notifyPermission(auth.user.companyId, "purchases.approve", { type: "purchase_approval", title: "Commande à approuver", body: `La commande #${id} attend votre approbation.`, link: "/achats", severity: "info", dedupeKey: `po:${id}` });
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Impossible de soumettre la commande.");
  }
}
