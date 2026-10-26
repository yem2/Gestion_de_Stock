import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, parseId, purchaseFailure, serverError } from "@/lib/api";
import { receiveSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Réception complète ou partielle, dans une seule fonction SQL (receive_purchase) :
 * bon de réception numéroté, quantités par ligne, stock et mouvements, statut de la commande.
 * Sans corps de requête, tout le reste à recevoir est réceptionné.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("purchases.receive"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");

  const raw = await request.json().catch(() => ({}));
  const parsed = receiveSchema.safeParse(raw ?? {});
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Données invalides.");
  const lines = parsed.data.lines ? JSON.stringify(parsed.data.lines) : null;
  const note = parsed.data.note?.trim() ? parsed.data.note.trim() : null;

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT receive_purchase(${auth.user.companyId}::uuid, ${id}::bigint, ${auth.user.id}::bigint, ${lines}::jsonb, ${note}::text) AS number
    `;
    const number = String(rows[0]?.number ?? "");
    await logAudit(auth.user.id, "purchase_receive", "purchase", id, number);
    return NextResponse.json({ ok: true, number });
  } catch (error) {
    return purchaseFailure(error) ?? serverError("Impossible d’enregistrer la réception.");
  }
}
