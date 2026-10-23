import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUuid, parseId, serverError } from "@/lib/api";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; barcodeId: string }> }) {
  const auth = await authorize(request, rolesFor("products.write"));
  if ("error" in auth) return auth.error;
  const params = await context.params;
  const id = parseId(params.id);
  if (!id || !isUuid(params.barcodeId)) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const rows = await sql`
      DELETE FROM product_barcodes
      WHERE id = ${params.barcodeId}::uuid AND product_id = ${id}::bigint AND company_id = ${auth.user.companyId}::uuid
      RETURNING barcode
    `;
    if (rows.length === 0) return fail("Code-barres introuvable.", 404);
    await logAudit(auth.user.id, "barcode_remove", "product", id, String(rows[0].barcode));
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Impossible de supprimer le code-barres.");
  }
}
