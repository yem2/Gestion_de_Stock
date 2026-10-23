import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isForeignKey, isUnique, parseBody, serverError } from "@/lib/api";
import { inventoryCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("inventory.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const counts = await sql`
      SELECT c.id, c.count_number AS number, c.status, c.created_at AS "createdAt", c.approved_at AS "approvedAt",
             w.name AS warehouse, u.name AS "createdBy",
             (SELECT COUNT(*) FILTER (WHERE l.counted_quantity IS NOT NULL)::int FROM inventory_count_lines l WHERE l.count_id = c.id) AS counted,
             (SELECT COUNT(*)::int FROM inventory_count_lines l WHERE l.count_id = c.id) AS total,
             (SELECT COUNT(*) FILTER (WHERE l.counted_quantity IS NOT NULL AND l.counted_quantity <> l.expected_quantity)::int FROM inventory_count_lines l WHERE l.count_id = c.id) AS variances
      FROM inventory_counts c
      JOIN warehouses w ON w.id = c.warehouse_id
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.company_id = ${auth.user.companyId}::uuid
      ORDER BY c.created_at DESC
      LIMIT 100
    `;
    return NextResponse.json({ counts });
  } catch {
    return serverError();
  }
}

/** Ouvre une session : le stock attendu de chaque produit est figé au moment de la création. */
export async function POST(request: Request) {
  const auth = await authorize(request, rolesFor("inventory.count"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, inventoryCreateSchema);
  if ("error" in body) return body.error;
  const { warehouseId } = body.data;
  try {
    const sql = getSql();
    const rows = await sql`
      WITH seq AS (
        INSERT INTO document_sequences (company_id, document_type, period, next_value)
        VALUES (${auth.user.companyId}::uuid, 'inventory_count', to_char(now(), 'YYYY'), 2)
        ON CONFLICT (company_id, document_type, period)
        DO UPDATE SET next_value = document_sequences.next_value + 1
        RETURNING period, next_value - 1 AS n
      ), c AS (
        INSERT INTO inventory_counts (company_id, count_number, warehouse_id, created_by)
        SELECT ${auth.user.companyId}::uuid, 'INV-' || seq.period || '-' || lpad(seq.n::text, 5, '0'), ${warehouseId}::uuid, ${auth.user.id}::bigint
        FROM seq
        WHERE EXISTS (SELECT 1 FROM warehouses WHERE id = ${warehouseId}::uuid AND company_id = ${auth.user.companyId}::uuid AND status = 'active')
        RETURNING id, count_number
      ), ins AS (
        INSERT INTO inventory_count_lines (company_id, count_id, product_id, expected_quantity)
        SELECT ${auth.user.companyId}::uuid, c.id, p.id, COALESCE(b.quantity_on_hand, 0)
        FROM c
        CROSS JOIN products p
        LEFT JOIN stock_balances b ON b.product_id = p.id AND b.company_id = p.company_id AND b.warehouse_id = ${warehouseId}::uuid
        WHERE p.company_id = ${auth.user.companyId}::uuid AND p.archived = FALSE
        RETURNING 1
      )
      SELECT id, count_number AS number FROM c
    `;
    if (rows.length === 0) return fail("Entrepôt introuvable ou inactif.", 400);
    await logAudit(auth.user.id, "inventory_create", "inventory_count", String(rows[0].id), String(rows[0].number));
    return NextResponse.json({ id: rows[0].id, number: rows[0].number }, { status: 201 });
  } catch (error) {
    if (isUnique(error)) return fail("Un inventaire est déjà en cours pour cet entrepôt.", 409);
    if (isForeignKey(error)) return fail("Entrepôt invalide.", 400);
    return serverError("Impossible de créer l’inventaire.");
  }
}
