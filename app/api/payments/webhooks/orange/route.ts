import { NextResponse } from "next/server";
import { findSession, refreshSession } from "@/lib/payments/sessions";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Notification d'Orange Money. Aucune session n'est requise (appel de serveur à serveur), et la notification
 * n'est jamais crue sur parole : le jeton doit correspondre à une demande connue, puis le statut est relu chez Orange.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { notif_token?: unknown } | null;
  const token = typeof body?.notif_token === "string" ? body.notif_token : "";
  if (token.length < 8) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const session = await findSession({ notifToken: token });
    if (!session) return NextResponse.json({ ok: false }, { status: 404 });
    await refreshSession(session);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
