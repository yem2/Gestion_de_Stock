import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { STOCK_MANAGERS, STOCK_WRITERS, authorize, logAudit } from "@/lib/auth";
import { applyMovement, listMovements, type MovementType } from "@/lib/stock";
import { movementSchema } from "@/lib/validation";

export const runtime = "nodejs";

const TYPES = ["in", "out", "adjustment"] as const;

export async function GET(request: Request) {
  const auth = await authorize(request, STOCK_WRITERS);
  if ("error" in auth) return auth.error;

  const params = new URL(request.url).searchParams;
  const productIdRaw = Number(params.get("productId"));
  const productId = Number.isInteger(productIdRaw) && productIdRaw > 0 ? productIdRaw : null;
  const typeRaw = params.get("type");
  const type = TYPES.find((value) => value === typeRaw) ?? null;
  const limitRaw = Number(params.get("limit"));
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;

  try {
    const movements = await listMovements(getSql(), { productId, type: type as MovementType | null, limit });
    return NextResponse.json({ movements });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("does not exist")) {
      return NextResponse.json(
        { error: "Migration manquante : exécutez db/0002_stock.sql dans Neon." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const parsed = movementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 }
    );
  }
  const { productId, type, quantity, note } = parsed.data;

  // Entrées / sorties : magasinier et au-dessus. Ajustement d'inventaire : gestionnaire et au-dessus.
  const auth = await authorize(request, type === "adjustment" ? STOCK_MANAGERS : STOCK_WRITERS);
  if ("error" in auth) return auth.error;

  try {
    const result = await applyMovement(getSql(), {
      productId, type, quantity, note: note || null, userId: auth.user.id
    });
    if (!result.ok) {
      const messages = {
        not_found: ["Produit introuvable ou archivé.", 404],
        insufficient: [`Stock insuffisant : ${result.available ?? 0} unité(s) disponible(s).`, 409],
        limit: ["La quantité totale dépasserait la limite autorisée.", 409],
        no_change: [`La quantité comptée est identique au stock actuel (${result.available ?? 0}).`, 409]
      } as const;
      const [error, status] = messages[result.reason];
      return NextResponse.json({ error }, { status });
    }
    await logAudit(auth.user.id, "stock_movement", "product", productId, `${type}:${quantity}`);
    return NextResponse.json({ movement: result.movement }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("does not exist")) {
      return NextResponse.json(
        { error: "Migration manquante : exécutez db/0002_stock.sql dans Neon." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Impossible d’enregistrer le mouvement." }, { status: 500 });
  }
}
