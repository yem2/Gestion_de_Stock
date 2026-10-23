import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { fail, serverError } from "@/lib/api";

export const runtime = "nodejs";

/** Retrouve un produit par code-barres, sinon par référence exacte (scan ou saisie en caisse). */
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  const code = (new URL(request.url).searchParams.get("code") ?? "").trim();
  if (code.length < 1 || code.length > 64) return fail("Code invalide.");
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT p.id, p.sku, p.name, p.quantity, p.unit_price AS "unitPrice"
      FROM products p
      WHERE p.company_id = ${auth.user.companyId}::uuid AND p.archived = FALSE
        AND (
          p.id IN (SELECT b.product_id FROM product_barcodes b WHERE b.company_id = ${auth.user.companyId}::uuid AND b.barcode = ${code})
          OR LOWER(p.sku) = LOWER(${code})
        )
      ORDER BY (p.id IN (SELECT b.product_id FROM product_barcodes b WHERE b.company_id = ${auth.user.companyId}::uuid AND b.barcode = ${code})) DESC
      LIMIT 1
    `;
    if (rows.length === 0) return fail("Aucun produit ne correspond à ce code.", 404);
    return NextResponse.json({ product: rows[0] });
  } catch {
    return serverError();
  }
}
