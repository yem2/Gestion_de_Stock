import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { STOCK_MANAGERS, authorize, logAudit } from "@/lib/auth";
import { updateProduct } from "@/lib/stock";
import { productUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Modifier un produit ou l'archiver / le restaurer (réservé aux gestionnaires et administrateurs). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, STOCK_MANAGERS);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = productUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 }
    );
  }
  const changes = { ...parsed.data };
  if (changes.category !== undefined && changes.category === "") changes.category = "Général";

  try {
    const product = await updateProduct(getSql(), productId, changes);
    if (!product) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
    const action = changes.archived === undefined ? "product_update" : changes.archived ? "product_archive" : "product_restore";
    await logAudit(auth.user.id, action, "product", productId, Object.keys(changes).join(","));
    return NextResponse.json({ product });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json({ error: "Cette référence existe déjà." }, { status: 409 });
    }
    return NextResponse.json({ error: "Impossible de modifier le produit." }, { status: 500 });
  }
}
