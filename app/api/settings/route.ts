import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { parseBody, serverError } from "@/lib/api";
import { settingsSchema } from "@/lib/validation";

export const runtime = "nodejs";

const DEFAULTS = { companyName: "Gestion de Stock", address: "", phone: "", footer: "Merci de votre confiance." };

async function readSettings(companyId: string) {
  const sql = getSql();
  const rows = await sql`SELECT settings FROM companies WHERE id = ${companyId}::uuid`;
  const raw = (rows[0]?.settings ?? {}) as Record<string, unknown>;
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) values[key] = String(value ?? "");
  return {
    companyName: values.company_name || DEFAULTS.companyName,
    address: values.address ?? DEFAULTS.address,
    phone: values.phone ?? DEFAULTS.phone,
    footer: values.footer ?? DEFAULTS.footer
  };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ settings: await readSettings(auth.user.companyId) });
  } catch {
    return NextResponse.json({ settings: DEFAULTS });
  }
}

export async function PUT(request: Request) {
  const auth = await authorize(request, rolesFor("settings.manage"));
  if ("error" in auth) return auth.error;
  const body = await parseBody(request, settingsSchema);
  if ("error" in body) return body.error;
  const d = body.data;
  try {
    const sql = getSql();
    const patch = JSON.stringify({
      company_name: d.companyName, address: d.address?.trim() ?? "",
      phone: d.phone?.trim() ?? "", footer: d.footer?.trim() ?? ""
    });
    await sql`
      UPDATE companies SET settings = settings || ${patch}::jsonb, updated_at = NOW()
      WHERE id = ${auth.user.companyId}::uuid
    `;
    await logAudit(auth.user.id, "settings_update", "settings");
    return NextResponse.json({ settings: await readSettings(auth.user.companyId) });
  } catch {
    return serverError("Impossible d’enregistrer les paramètres.");
  }
}
