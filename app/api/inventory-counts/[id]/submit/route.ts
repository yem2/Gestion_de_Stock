import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUuid, serverError } from "@/lib/api";
import { notifyPermission } from "@/lib/notify";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("inventory.count"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE inventory_counts SET status = 'submitted'
      WHERE id = ${id}::uuid AND company_id = ${auth.user.companyId}::uuid AND status = 'open'
      RETURNING id
    `;
    if (rows.length === 0) return fail("Cet inventaire n’est pas dans un état qui permet cette action.", 409);
    await logAudit(auth.user.id, "inventory_submit", "inventory_count", id);
    await notifyPermission(auth.user.companyId, "inventory.count.approve", { type: "inventory_approval", title: "Inventaire à approuver", body: "Un comptage d’inventaire attend votre approbation.", link: "/inventaires", severity: "info", dedupeKey: `inv:${id}` });
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Impossible de soumettre l’inventaire.");
  }
}
