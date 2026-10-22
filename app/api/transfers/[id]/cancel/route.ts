import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUuid, serverError, transferFailure } from "@/lib/api";

export const runtime = "nodejs";

/** L'opération s'exécute dans une fonction SQL unique : tout réussit ou tout est annulé. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("transfers.write"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    await sql`SELECT cancel_transfer(${auth.user.companyId}::uuid, ${id}::uuid)`;
    await logAudit(auth.user.id, "transfer_cancel", "transfer", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return transferFailure(error) ?? serverError("Impossible d’annuler le transfert.");
  }
}
