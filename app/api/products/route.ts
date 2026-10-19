import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { STOCK_MANAGERS, STOCK_WRITERS, authorize, logAudit } from "@/lib/auth";
import { createProduct, listProducts } from "@/lib/stock";
import { productInputSchema } from "@/lib/validation";

export const runtime = "nodejs";

function dbError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("DATABASE_URL")) {
    return NextResponse.json({ error: "Base de données non configurée." }, { status: 503 });
  }
  if (message.includes("archived") && message.includes("does not exist")) {
    return NextResponse.json(
      { error: "Migration manquante : exécutez db/0002_stock.sql dans Neon." },
      { status: 500 }
    );
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  const wantsArchived = new URL(request.url).searchParams.get("archived") === "1";
  const auth = await authorize(request, wantsArchived ? STOCK_MANAGERS : undefined);
  if ("error" in auth) return auth.error;
  try {
    const products = await listProducts(getSql(), wantsArchived);
    return NextResponse.json({ products });
  } catch (error) {
    return dbError(error, "Erreur serveur.");
  }
}

export async function POST(request: Request) {
  const auth = await authorize(request, STOCK_WRITERS);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const parsed = productInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 }
    );
  }

  try {
    const { sku, name, category, quantity, unitPrice, minQuantity } = parsed.data;
    const product = await createProduct(getSql(), {
      sku, name, category: category || "Général", quantity, unitPrice, minQuantity, userId: auth.user.id
    });
    await logAudit(auth.user.id, "product_create", "product", Number(product.id), sku);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json({ error: "Cette référence existe déjà." }, { status: 409 });
    }
    return dbError(error, "Impossible d’enregistrer le produit.");
  }
}
