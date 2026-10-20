import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUnique, parseBody, parseId, serverError } from "@/lib/api";
import { productUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const auth = await authorize(request, rolesFor("products.write"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  const body = await parseBody(request, productUpdateSchema);
  if ("error" in body) return body.error;
  const d = body.data;

  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE products SET
        sku = COALESCE(${d.sku ?? null}::text, sku),
        name = COALESCE(${d.name ?? null}::text, name),
        category = COALESCE(${d.category ?? null}::text, category),
        unit_price = COALESCE(${d.unitPrice ?? null}::numeric, unit_price),
        min_quantity = COALESCE(${d.minQuantity ?? null}::int, min_quantity),
        updated_at = NOW()
      WHERE id = ${id} AND archived = FALSE
      RETURNING id, sku, name, category, quantity, unit_price AS "unitPrice", min_quantity AS "minQuantity"
    `;
    if (!rows[0]) return fail("Produit introuvable.", 404);
    await logAudit(auth.user.id, "product_update", "product", id);
    return NextResponse.json({ product: rows[0] });
  } catch (error) {
    if (isUnique(error)) return fail("Cette référence existe déjà.", 409);
    return serverError("Impossible de modifier le produit.");
  }
}

/** Archivage : le produit disparaît des listes mais l'historique des mouvements et ventes est conservé. */
export async function DELETE(request: Request, context: Context) {
  const auth = await authorize(request, rolesFor("products.archive"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const rows = await sql`UPDATE products SET archived = TRUE, updated_at = NOW() WHERE id = ${id} AND archived = FALSE RETURNING id`;
    if (!rows[0]) return fail("Produit introuvable.", 404);
    await logAudit(auth.user.id, "product_archive", "product", id);
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Impossible d’archiver le produit.");
  }
}
