import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { productInputSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, sku, name, category, quantity, unit_price AS "unitPrice",
             min_quantity AS "minQuantity", created_at AS "createdAt"
      FROM products
      ORDER BY created_at DESC
      LIMIT 500
    `;
    return NextResponse.json({ products: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur";
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
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
    const sql = getSql();
    const { sku, name, category, quantity, unitPrice, minQuantity } = parsed.data;
    const rows = await sql`
      INSERT INTO products (sku, name, category, quantity, unit_price, min_quantity)
      VALUES (${sku}, ${name}, ${category || "Général"}, ${quantity}, ${unitPrice}, ${minQuantity})
      RETURNING id, sku, name, category, quantity, unit_price AS "unitPrice",
                min_quantity AS "minQuantity", created_at AS "createdAt"
    `;
    return NextResponse.json({ product: rows[0] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur";
    if (message.toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "Cette référence existe déjà." }, { status: 409 });
    }
    if (message.includes("DATABASE_URL")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: "Impossible d’enregistrer le produit. Vérifiez que la migration SQL a été exécutée." }, { status: 500 });
  }
}
