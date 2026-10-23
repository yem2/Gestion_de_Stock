import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, inventoryFailure, isUuid, serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Applique tous les écarts dans une seule fonction SQL : tout réussit ou rien n'est modifié. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("inventory.approve"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const rows = await sql`SELECT approve_inventory_count(${auth.user.companyId}::uuid, ${id}::uuid, ${auth.user.id}::bigint) AS adjusted`;
    await logAudit(auth.user.id, "inventory_approve", "inventory_count", id, String(rows[0]?.adjusted ?? 0));
    return NextResponse.json({ ok: true, adjusted: rows[0]?.adjusted ?? 0 });
  } catch (error) {
    return inventoryFailure(error) ?? serverError("Impossible d’approuver l’inventaire.");
  }
}
