import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isForeignKey, parseBody, serverError } from "@/lib/api";
import { transferSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("transfers.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const transfers = await sql`
      SELECT t.id, t.transfer_number AS number, t.status, t.note,
             t.created_at AS "createdAt", t.shipped_at AS "shippedAt", t.received_at AS "receivedAt",
             ws.name AS source, wd.name AS destination, u.name AS "createdBy",
             (SELECT COUNT(*)::int FROM stock_transfer_lines l WHERE l.transfer_id = t.id) AS lines,
             (SELECT COALESCE(SUM(l.quantity_requested), 0)::int FROM stock_transfer_lines l WHERE l.transfer_id = t.id) AS units
      FROM stock_transfers t
      JOIN warehouses ws ON ws.id = t.source_warehouse_id
      JOIN warehouses wd ON wd.id = t.destination_warehouse_id
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.company_id = ${auth.user.companyId}::uuid
      ORDER BY t.created_at DESC
      LIMIT 200
    `;
    return NextResponse.json({ transfers });
  } catch {
    return serverError();
  }
}

/** Crée un brouillon : numéro généré côté serveur, lignes enregistrées dans la même instruction. */
export async function POST(request: Request) {
  const auth = await authorize(request, rolesFor("transfers.write"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, transferSchema);
  if ("error" in body) return body.error;
  const { sourceId, destinationId, lines } = body.data;
  const note = body.data.note?.trim() ? body.data.note.trim() : null;
  try {
    const sql = getSql();
    const rows = await sql`
      WITH seq AS (
        INSERT INTO document_sequences (company_id, document_type, period, next_value)
        VALUES (${auth.user.companyId}::uuid, 'transfer', to_char(now(), 'YYYY'), 2)
        ON CONFLICT (company_id, document_type, period)
        DO UPDATE SET next_value = document_sequences.next_value + 1
        RETURNING period, next_value - 1 AS n
      ), tr AS (
        INSERT INTO stock_transfers (company_id, transfer_number, source_warehouse_id, destination_warehouse_id, note, created_by)
        SELECT ${auth.user.companyId}::uuid, 'TR-' || seq.period || '-' || lpad(seq.n::text, 5, '0'),
               ${sourceId}::uuid, ${destinationId}::uuid, ${note}::text, ${auth.user.id}::bigint
        FROM seq
        WHERE (
          SELECT COUNT(*) FROM warehouses
          WHERE company_id = ${auth.user.companyId}::uuid AND status = 'active' AND id IN (${sourceId}::uuid, ${destinationId}::uuid)
        ) = 2
        RETURNING id, transfer_number
      ), ins AS (
        INSERT INTO stock_transfer_lines (company_id, transfer_id, product_id, quantity_requested)
        SELECT ${auth.user.companyId}::uuid, tr.id, x."productId", x.quantity
        FROM tr, jsonb_to_recordset(${JSON.stringify(lines)}::jsonb) AS x("productId" bigint, quantity numeric)
        RETURNING 1
      )
      SELECT id, transfer_number AS number FROM tr
    `;
    if (rows.length === 0) return fail("Entrepôt introuvable ou inactif.", 400);
    await logAudit(auth.user.id, "transfer_create", "transfer", String(rows[0].id), String(rows[0].number));
    return NextResponse.json({ id: rows[0].id, number: rows[0].number }, { status: 201 });
  } catch (error) {
    if (isForeignKey(error)) return fail("Entrepôt ou produit invalide.", 400);
    return serverError("Impossible de créer le transfert.");
  }
}
