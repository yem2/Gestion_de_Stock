import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, isForeignKey, parseBody, parseId, serverError } from "@/lib/api";
import { contactSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const auth = await authorize(request, rolesFor("suppliers.write"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  const body = await parseBody(request, contactSchema);
  if ("error" in body) return body.error;
  const d = body.data;
  const phone = d.phone?.trim() ? d.phone.trim() : null;
  const email = d.email?.trim() ? d.email.trim() : null;
  const address = d.address?.trim() ? d.address.trim() : null;
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE suppliers SET
        name = ${d.name},
        phone = ${phone},
        email = ${email},
        address = ${address}
      WHERE id = ${id} AND company_id = ${auth.user.companyId}::uuid
      RETURNING id, name, phone, email, address, created_at AS "createdAt"
    `;
    if (!rows[0]) return fail("Introuvable.", 404);
    await logAudit(auth.user.id, "supplier_update", "supplier", id);
    return NextResponse.json({ supplier: rows[0] });
  } catch {
    return serverError("Impossible de modifier le fournisseur.");
  }
}

export async function DELETE(request: Request, context: Context) {
  const auth = await authorize(request, rolesFor("suppliers.write"));
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return fail("Identifiant invalide.");
  try {
    const sql = getSql();
    const rows = await sql`DELETE FROM suppliers WHERE id = ${id} AND company_id = ${auth.user.companyId}::uuid RETURNING id`;
    if (!rows[0]) return fail("Introuvable.", 404);
    await logAudit(auth.user.id, "supplier_delete", "supplier", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isForeignKey(error)) return fail("Suppression impossible : cet élément est utilisé dans l’historique.", 409);
    return serverError("Impossible de supprimer.");
  }
}
