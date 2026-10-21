import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUnique, parseBody, serverError } from "@/lib/api";
import { productInputSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, sku, name, category, quantity, unit_price AS "unitPrice",
             min_quantity AS "minQuantity", created_at AS "createdAt"
      FROM products WHERE company_id = ${auth.user.companyId}::uuid AND archived = FALSE
      ORDER BY name ASC LIMIT 1000
    `;
    return NextResponse.json({ products: rows });
  } catch {
    return serverError();
  }
}

export async function POST(request: Request) {
  const auth = await authorize(request, rolesFor("products.write"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, productInputSchema);
  if ("error" in body) return body.error;
  const { sku, name, category, quantity, unitPrice, minQuantity } = body.data;

  try {
    const sql = getSql();
    const rows = await sql`
      WITH p AS (
        INSERT INTO products (company_id, sku, name, category, quantity, unit_price, min_quantity)
        VALUES (${auth.user.companyId}::uuid, ${sku}, ${name}, ${category || "Général"}, ${quantity}, ${unitPrice}, ${minQuantity})
        RETURNING id, company_id, sku, name, category, quantity, unit_price, min_quantity, created_at
      ), m AS (
        INSERT INTO stock_movements (company_id, product_id, movement_type, quantity, note, user_id)
        SELECT company_id, id, 'in', quantity, 'Stock initial', ${auth.user.id}::bigint FROM p WHERE quantity > 0
        RETURNING 1
      )
      SELECT id, sku, name, category, quantity, unit_price AS "unitPrice",
             min_quantity AS "minQuantity", created_at AS "createdAt"
      FROM p
    `;
    await logAudit(auth.user.id, "product_create", "product", Number(rows[0].id), sku);
    return NextResponse.json({ product: rows[0] }, { status: 201 });
  } catch (error) {
    if (isUnique(error)) return fail("Cette référence existe déjà.", 409);
    return serverError("Impossible d’enregistrer le produit.");
  }
}
