import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUnique, isUuid, parseBody, serverError } from "@/lib/api";
import { warehouseUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("warehouses.write"));
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("Identifiant invalide.");
  const body = await parseBody(request, warehouseUpdateSchema);
  if ("error" in body) return body.error;
  const { name, code, status } = body.data;
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE warehouses w SET
        name = COALESCE(${name ?? null}::text, w.name),
        code = COALESCE(${code ?? null}::text, w.code),
        status = COALESCE(${status ?? null}::text, w.status)
      WHERE w.id = ${id}::uuid AND w.company_id = ${auth.user.companyId}::uuid
        AND (
          ${status ?? null}::text IS DISTINCT FROM 'inactive'
          OR (NOT w.is_default AND NOT EXISTS (
            SELECT 1 FROM stock_balances b WHERE b.warehouse_id = w.id AND b.quantity_on_hand > 0
          ) AND NOT EXISTS (
            SELECT 1 FROM stock_transfers t WHERE t.status IN ('draft', 'shipped') AND (t.source_warehouse_id = w.id OR t.destination_warehouse_id = w.id)
          ))
        )
      RETURNING w.id
    `;
    if (rows.length === 0) {
      return fail("Entrepôt introuvable, ou impossible à désactiver (entrepôt principal, stock restant ou transfert en cours).", 409);
    }
    await logAudit(auth.user.id, "warehouse_update", "warehouse", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isUnique(error)) return fail("Ce code d’entrepôt existe déjà.", 409);
    return serverError("Impossible de modifier l’entrepôt.");
  }
}
