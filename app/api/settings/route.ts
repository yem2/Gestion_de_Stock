import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { parseBody, serverError } from "@/lib/api";
import { settingsSchema } from "@/lib/validation";

export const runtime = "nodejs";

const DEFAULTS = { companyName: "Gestion de Stock", address: "", phone: "", footer: "Merci de votre confiance." };

async function readSettings() {
  const sql = getSql();
  const rows = await sql`SELECT key, value FROM settings`;
  const values: Record<string, string> = {};
  for (const row of rows) values[String(row.key)] = String(row.value);
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
    return NextResponse.json({ settings: await readSettings() });
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
    await sql`
      INSERT INTO settings (key, value) VALUES
        ('company_name', ${d.companyName}), ('address', ${d.address?.trim() ?? ""}),
        ('phone', ${d.phone?.trim() ?? ""}), ('footer', ${d.footer?.trim() ?? ""})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    await logAudit(auth.user.id, "settings_update", "settings");
    return NextResponse.json({ settings: await readSettings() });
  } catch {
    return serverError("Impossible d’enregistrer les paramètres.");
  }
}
