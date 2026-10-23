import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUuid, serverError } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("inventory.count"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE inventory_counts SET status = 'cancelled'
      WHERE id = ${id}::uuid AND company_id = ${auth.user.companyId}::uuid AND status IN ('open', 'submitted')
      RETURNING id
    `;
    if (rows.length === 0) return fail("Cet inventaire n’est pas dans un état qui permet cette action.", 409);
    await logAudit(auth.user.id, "inventory_cancel", "inventory_count", id);
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Impossible d’annuler l’inventaire.");
  }
}
