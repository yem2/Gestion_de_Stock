import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isUnique, parseBody, serverError } from "@/lib/api";
import { warehouseSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("warehouses.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const warehouses = await sql`
      SELECT w.id, w.name, w.code, w.status, w.is_default AS "isDefault",
             COALESCE(s.products, 0)::int AS products, COALESCE(s.units, 0)::int AS units
      FROM warehouses w
      LEFT JOIN (
        SELECT warehouse_id, COUNT(*) FILTER (WHERE quantity_on_hand > 0) AS products, SUM(quantity_on_hand) AS units
        FROM stock_balances WHERE company_id = ${auth.user.companyId}::uuid GROUP BY warehouse_id
      ) s ON s.warehouse_id = w.id
      WHERE w.company_id = ${auth.user.companyId}::uuid
      ORDER BY w.is_default DESC, w.name ASC
    `;
    return NextResponse.json({ warehouses });
  } catch {
    return serverError();
  }
}

export async function POST(request: Request) {
  const auth = await authorize(request, rolesFor("warehouses.write"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, warehouseSchema);
  if ("error" in body) return body.error;
  try {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO warehouses (company_id, name, code)
      VALUES (${auth.user.companyId}::uuid, ${body.data.name}, ${body.data.code})
      RETURNING id
    `;
    await logAudit(auth.user.id, "warehouse_create", "warehouse", String(rows[0].id), body.data.code);
    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } catch (error) {
    if (isUnique(error)) return fail("Ce code d’entrepôt existe déjà.", 409);
    return serverError("Impossible de créer l’entrepôt.");
  }
}
