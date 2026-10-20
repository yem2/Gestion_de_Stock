import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { parseBody, serverError } from "@/lib/api";
import { contactSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("customers.view"));
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, name, phone, email, created_at AS "createdAt"
      FROM customers ORDER BY name ASC LIMIT 1000
    `;
    return NextResponse.json({ customers: rows });
  } catch {
    return serverError();
  }
}

export async function POST(request: Request) {
  const auth = await authorize(request, rolesFor("customers.write"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, contactSchema);
  if ("error" in body) return body.error;
  const d = body.data;
  const phone = d.phone?.trim() ? d.phone.trim() : null;
  const email = d.email?.trim() ? d.email.trim() : null;
  try {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO customers (name, phone, email)
      VALUES (${d.name}, ${phone}, ${email})
      RETURNING id, name, phone, email, created_at AS "createdAt"
    `;
    await logAudit(auth.user.id, "customer_create", "customer", Number(rows[0].id));
    return NextResponse.json({ customer: rows[0] }, { status: 201 });
  } catch {
    return serverError("Impossible d’enregistrer le client.");
  }
}
