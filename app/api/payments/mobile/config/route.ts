import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { providerStatus } from "@/lib/payments/mobile";

export const runtime = "nodejs";

/** État de la configuration des opérateurs : seuls les NOMS des variables manquantes sont révélés, jamais les valeurs. */
export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("payments.write"));
  if ("error" in auth) return auth.error;
  return NextResponse.json({ providers: providerStatus() });
}
