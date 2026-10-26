import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, parseId, serverError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, rolesFor("purchases.view"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const orders = await sql`
      SELECT o.id, o.order_number AS "orderNumber", o.status, o.total_cost AS total, o.note, o.created_at AS "createdAt", o.received_at AS "receivedAt",
             s.name AS "supplierName", u.name AS "userName"
      FROM purchase_orders o
      LEFT JOIN suppliers s ON s.id = o.supplier_id
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.id = ${id} AND o.company_id = ${auth.user.companyId}::uuid
    `;
    if (!orders[0]) return fail("Commande introuvable.", 404);
    const items = await sql`
      SELECT i.id, p.name, p.sku, i.quantity, i.unit_cost AS "unitCost",
             i.quantity_received AS received, i.quantity_rejected AS rejected
      FROM purchase_order_items i JOIN products p ON p.id = i.product_id
      WHERE i.order_id = ${id} ORDER BY i.id ASC
    `;
    const receipts = await sql`
      SELECT r.receipt_number AS number, r.received_at AS "receivedAt", r.note, u.name AS "userName"
      FROM goods_receipts r LEFT JOIN users u ON u.id = r.received_by
      WHERE r.order_id = ${id} AND r.company_id = ${auth.user.companyId}::uuid
      ORDER BY r.received_at ASC
    `;
    return NextResponse.json({ purchase: orders[0], items, receipts });
  } catch {
    return serverError();
  }
}
