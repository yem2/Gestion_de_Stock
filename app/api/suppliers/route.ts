import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { parseBody, serverError } from "@/lib/api";
import { contactSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("suppliers.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, name, phone, email, address, created_at AS "createdAt"
      FROM suppliers WHERE company_id = ${auth.user.companyId}::uuid ORDER BY name ASC LIMIT 1000
    `;
    return NextResponse.json({ suppliers: rows });
  } catch {
    return serverError();
  }
}

export async function POST(request: Request) {
  const auth = await authorize(request, rolesFor("suppliers.write"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, contactSchema);
  if ("error" in body) return body.error;
  const d = body.data;
  const phone = d.phone?.trim() ? d.phone.trim() : null;
  const email = d.email?.trim() ? d.email.trim() : null;
  const address = d.address?.trim() ? d.address.trim() : null;
  try {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO suppliers (company_id, name, phone, email, address)
      VALUES (${auth.user.companyId}::uuid, ${d.name}, ${phone}, ${email}, ${address})
      RETURNING id, name, phone, email, address, created_at AS "createdAt"
    `;
    await logAudit(auth.user.id, "supplier_create", "supplier", Number(rows[0].id));
    return NextResponse.json({ supplier: rows[0] }, { status: 201 });
  } catch {
    return serverError("Impossible d’enregistrer le fournisseur.");
  }
}
