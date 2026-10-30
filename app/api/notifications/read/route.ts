import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { parseBody, serverError } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.boolean().optional() });

/** Marque comme lues les notifications de l'utilisateur connecté (jamais celles d'un autre). */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const all = body.data.all === true;
  const ids = JSON.stringify(body.data.ids ?? []);
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE notifications SET read_at = NOW()
      WHERE company_id = ${auth.user.companyId}::uuid AND user_id = ${auth.user.id}::bigint AND read_at IS NULL
        AND (${all}::boolean OR id IN (SELECT jsonb_array_elements_text(${ids}::jsonb)::uuid))
      RETURNING id`;
    return NextResponse.json({ ok: true, updated: rows.length });
  } catch {
    return serverError();
  }
}
