import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { fail, serverError } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

const MAX_BYTES = 200_000;

const avatarSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(100).max(300_000).regex(/^[A-Za-z0-9+/]+={0,2}$/, "Image invalide")
});

/** Vérifie que le contenu correspond vraiment au type annoncé (signature du fichier). */
function matchesSignature(contentType: string, bytes: Buffer) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
}

/** Chaque utilisateur modifie uniquement sa propre photo. */
export async function PUT(request: Request) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  const parsed = avatarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Image invalide.");
  const bytes = Buffer.from(parsed.data.data, "base64");
  if (bytes.length > MAX_BYTES) return fail("Image trop lourde (200 Ko maximum).");
  if (!matchesSignature(parsed.data.contentType, bytes)) return fail("Le fichier n’est pas une image valide.");
  try {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO user_avatars (user_id, content_type, data_base64)
      VALUES (${auth.user.id}::bigint, ${parsed.data.contentType}, ${parsed.data.data})
      ON CONFLICT (user_id) DO UPDATE SET content_type = EXCLUDED.content_type, data_base64 = EXCLUDED.data_base64, updated_at = now()
      RETURNING (extract(epoch FROM updated_at) * 1000)::bigint AS version
    `;
    await logAudit(auth.user.id, "avatar_update", "user", auth.user.id);
    return NextResponse.json({ version: Number(rows[0].version) });
  } catch {
    return serverError("Impossible d’enregistrer la photo.");
  }
}

export async function DELETE(request: Request) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  try {
    const sql = getSql();
    await sql`DELETE FROM user_avatars WHERE user_id = ${auth.user.id}::bigint`;
    await logAudit(auth.user.id, "avatar_remove", "user", auth.user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Impossible de supprimer la photo.");
  }
}
