import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUuid, parseBody, serverError } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ openingBalance: z.coerce.number().min(-1_000_000_000_000).max(1_000_000_000_000) });

/** Solde d'ouverture d'un compte de trésorerie (montant réellement détenu au démarrage de l'application). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("expenses.approve"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE cash_accounts SET opening_balance = ${body.data.openingBalance}::numeric
      WHERE id = ${id}::uuid AND company_id = ${auth.user.companyId}::uuid RETURNING id`;
    if (!rows[0]) return fail("Compte introuvable.", 404);
    await logAudit(auth.user.id, "account_opening_balance", "cash_account", id, String(body.data.openingBalance));
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Impossible de modifier le solde d’ouverture.");
  }
}
