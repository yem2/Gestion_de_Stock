// ATTENTION : module NON UTILISÉ par les routes actuelles (elles contiennent leurs propres requêtes).
// Ses requêtes ne filtrent PAS par company_id : ne pas l'importer sans les adapter (voir app/api/movements/route.ts).
import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

export type MovementType = "in" | "out" | "adjustment";

export type MovementInput = {
  productId: number;
  type: MovementType;
  /** Entrée / sortie : quantité déplacée. Ajustement : nouvelle quantité comptée. */
  quantity: number;
  note: string | null;
  userId: number;
};

export type MovementResult =
  | { ok: true; movement: Record<string, unknown> }
  | { ok: false; reason: "not_found" | "insufficient" | "limit" | "no_change"; available?: number };

// Plafond sous la limite des entiers PostgreSQL (2 147 483 647) pour éviter tout dépassement.
const MAX_STOCK = 2_000_000_000;

/**
 * Mouvement de stock en UNE seule instruction SQL : la mise à jour de la quantité et l'écriture
 * du mouvement réussissent ou échouent ensemble, et la condition sur la quantité est évaluée
 * au moment de l'écriture (pas de stock négatif, pas de double déduction en cas de clics simultanés).
 */
export async function applyMovement(sql: Sql, input: MovementInput): Promise<MovementResult> {
  const { productId, type, quantity, note, userId } = input;
  let rows: Record<string, unknown>[];

  if (type === "adjustment") {
    rows = await sql`
      WITH cur AS (
        SELECT id, quantity FROM products
        WHERE id = ${productId}::bigint AND archived = FALSE
        FOR UPDATE
      ), upd AS (
        UPDATE products p SET quantity = ${quantity}::int, updated_at = NOW()
        FROM cur
        WHERE p.id = cur.id AND cur.quantity <> ${quantity}::int
        RETURNING p.id, cur.quantity AS before, p.quantity AS after
      )
      INSERT INTO stock_movements (product_id, movement_type, quantity, note, user_id, quantity_before, quantity_after)
      SELECT id, 'adjustment', ABS(after - before), ${note}::text, ${userId}::bigint, before, after FROM upd
      RETURNING id, product_id AS "productId", movement_type AS type, quantity,
                quantity_before AS "quantityBefore", quantity_after AS "quantityAfter", created_at AS "createdAt"
    `;
  } else {
    const delta = type === "in" ? quantity : -quantity;
    rows = await sql`
      WITH upd AS (
        UPDATE products SET quantity = quantity + ${delta}::int, updated_at = NOW()
        WHERE id = ${productId}::bigint AND archived = FALSE
          AND quantity + ${delta}::int >= 0 AND quantity + ${delta}::int <= ${MAX_STOCK}::int
        RETURNING id, quantity AS after, quantity - ${delta}::int AS before
      )
      INSERT INTO stock_movements (product_id, movement_type, quantity, note, user_id, quantity_before, quantity_after)
      SELECT id, ${type}::text, ${quantity}::int, ${note}::text, ${userId}::bigint, before, after FROM upd
      RETURNING id, product_id AS "productId", movement_type AS type, quantity,
                quantity_before AS "quantityBefore", quantity_after AS "quantityAfter", created_at AS "createdAt"
    `;
  }

  if (rows[0]) return { ok: true, movement: rows[0] };

  // Aucune ligne : on cherche pourquoi pour renvoyer un message clair.
  const current = await sql`SELECT quantity, archived FROM products WHERE id = ${productId}::bigint`;
  const product = current[0];
  if (!product || product.archived) return { ok: false, reason: "not_found" };
  const available = Number(product.quantity);
  if (type === "adjustment") return { ok: false, reason: "no_change", available };
  if (type === "out") return { ok: false, reason: "insufficient", available };
  return { ok: false, reason: "limit", available };
}

export type ProductCreateInput = {
  sku: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  minQuantity: number;
  userId: number;
};

/** Crée le produit et, si la quantité initiale est positive, son mouvement « Stock initial » (même instruction). */
export async function createProduct(sql: Sql, input: ProductCreateInput) {
  const rows = await sql`
    WITH p AS (
      INSERT INTO products (sku, name, category, quantity, unit_price, min_quantity)
      VALUES (${input.sku}, ${input.name}, ${input.category}, ${input.quantity}::int, ${input.unitPrice}::numeric, ${input.minQuantity}::int)
      RETURNING id, sku, name, category, quantity, unit_price, min_quantity, archived, created_at
    ), m AS (
      INSERT INTO stock_movements (product_id, movement_type, quantity, note, user_id, quantity_before, quantity_after)
      SELECT id, 'in', quantity, 'Stock initial', ${input.userId}::bigint, 0, quantity FROM p WHERE quantity > 0
    )
    SELECT id, sku, name, category, quantity, unit_price AS "unitPrice", min_quantity AS "minQuantity",
           archived, created_at AS "createdAt"
    FROM p
  `;
  return rows[0];
}

export type ProductChanges = {
  sku?: string;
  name?: string;
  category?: string;
  unitPrice?: number;
  minQuantity?: number;
  archived?: boolean;
};

/** Modifie les champs fournis (la quantité ne change que par les mouvements de stock). */
export async function updateProduct(sql: Sql, id: number, changes: ProductChanges) {
  const rows = await sql`
    UPDATE products SET
      sku = COALESCE(${changes.sku ?? null}::text, sku),
      name = COALESCE(${changes.name ?? null}::text, name),
      category = COALESCE(${changes.category ?? null}::text, category),
      unit_price = COALESCE(${changes.unitPrice ?? null}::numeric, unit_price),
      min_quantity = COALESCE(${changes.minQuantity ?? null}::int, min_quantity),
      archived = COALESCE(${changes.archived ?? null}::boolean, archived),
      updated_at = NOW()
    WHERE id = ${id}::bigint
    RETURNING id, sku, name, category, quantity, unit_price AS "unitPrice", min_quantity AS "minQuantity",
              archived, created_at AS "createdAt"
  `;
  return rows[0];
}

export async function listProducts(sql: Sql, archived: boolean) {
  return sql`
    SELECT id, sku, name, category, quantity, unit_price AS "unitPrice", min_quantity AS "minQuantity",
           archived, created_at AS "createdAt"
    FROM products
    WHERE archived = ${archived}::boolean
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  `;
}

export async function listMovements(sql: Sql, opts: { productId: number | null; type: MovementType | null; limit: number }) {
  return sql`
    SELECT m.id, m.movement_type AS type, m.quantity, m.quantity_before AS "quantityBefore",
           m.quantity_after AS "quantityAfter", m.note, m.created_at AS "createdAt",
           p.id AS "productId", p.name AS "productName", p.sku AS "productSku", u.name AS "userName"
    FROM stock_movements m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN users u ON u.id = m.user_id
    WHERE (${opts.productId}::bigint IS NULL OR m.product_id = ${opts.productId}::bigint)
      AND (${opts.type}::text IS NULL OR m.movement_type = ${opts.type}::text)
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${opts.limit}::int
  `;
}
