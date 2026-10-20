import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isForeignKey, parseBody, parseId, serverError } from "@/lib/api";
import { contactSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const auth = await authorize(request, rolesFor("customers.write"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  const body = await parseBody(request, contactSchema);
  if ("error" in body) return body.error;
  const d = body.data;
  const phone = d.phone?.trim() ? d.phone.trim() : null;
  const email = d.email?.trim() ? d.email.trim() : null;
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE customers SET
        name = ${d.name},
        phone = ${phone},
        email = ${email}
      WHERE id = ${id}
      RETURNING id, name, phone, email, created_at AS "createdAt"
    `;
    if (!rows[0]) return fail("Introuvable.", 404);
    await logAudit(auth.user.id, "customer_update", "customer", id);
    return NextResponse.json({ customer: rows[0] });
  } catch {
    return serverError("Impossible de modifier le client.");
  }
}

export async function DELETE(request: Request, context: Context) {
  const auth = await authorize(request, rolesFor("customers.write"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const rows = await sql`DELETE FROM customers WHERE id = ${id} RETURNING id`;
    if (!rows[0]) return fail("Introuvable.", 404);
    await logAudit(auth.user.id, "customer_delete", "customer", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isForeignKey(error)) return fail("Suppression impossible : cet élément est utilisé dans l’historique.", 409);
    return serverError("Impossible de supprimer.");
  }
}
