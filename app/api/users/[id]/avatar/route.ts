import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { parseId } from "@/lib/api";

export const runtime = "nodejs";

/** Photo d'un utilisateur, visible uniquement par les membres de sa propre entreprise. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT a.content_type AS "contentType", a.data_base64 AS data, (extract(epoch FROM a.updated_at) * 1000)::bigint AS version
      FROM user_avatars a
      JOIN company_memberships m ON m.user_id = a.user_id AND m.company_id = ${auth.user.companyId}::uuid AND m.status = 'active'
      WHERE a.user_id = ${id}::bigint
    `;
    const row = rows[0];
    if (!row) return new NextResponse(null, { status: 404 });
    const etag = `W/"${row.version}"`;
    const headers = {
      "Content-Type": String(row.contentType),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      ETag: etag
    };
    if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
    return new NextResponse(Buffer.from(String(row.data), "base64"), { status: 200, headers });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
