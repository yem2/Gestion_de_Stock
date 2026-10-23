import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isForeignKey, isUnique, parseBody, parseId, serverError } from "@/lib/api";
import { barcodeSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const barcodes = await sql`
      SELECT id, barcode FROM product_barcodes
      WHERE company_id = ${auth.user.companyId}::uuid AND product_id = ${id}::bigint
      ORDER BY created_at ASC
    `;
    return NextResponse.json({ barcodes });
  } catch {
    return serverError();
  }
}

export async function POST(request: Request, context: Context) {
  const auth = await authorize(request, rolesFor("products.write"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  const body = await parseBody(request, barcodeSchema);
  if ("error" in body) return body.error;
  try {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO product_barcodes (company_id, product_id, barcode)
      VALUES (${auth.user.companyId}::uuid, ${id}::bigint, ${body.data.barcode})
      RETURNING id, barcode
    `;
    await logAudit(auth.user.id, "barcode_add", "product", id, body.data.barcode);
    return NextResponse.json({ barcode: rows[0] }, { status: 201 });
  } catch (error) {
    if (isUnique(error)) return fail("Ce code-barres est déjà utilisé par un produit.", 409);
    if (isForeignKey(error)) return fail("Produit introuvable.", 404);
    return serverError("Impossible d’ajouter le code-barres.");
  }
}
