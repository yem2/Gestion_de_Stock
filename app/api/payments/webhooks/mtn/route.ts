import { NextResponse } from "next/server";
import { findSession, refreshSession } from "@/lib/payments/sessions";

export const runtime = "nodejs";
export const maxDuration = 30;

async function handle(request: Request) {
  const body = (await request.json().catch(() => null)) as { externalId?: unknown; referenceId?: unknown } | null;
  const candidate = request.headers.get("x-reference-id") ?? (typeof body?.externalId === "string" ? body.externalId : typeof body?.referenceId === "string" ? body.referenceId : "");
  if (!/^[0-9a-fA-F-]{36}$/.test(candidate)) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const session = await findSession({ provider: "mtn_money", externalId: candidate.toLowerCase() });
    if (!session) return NextResponse.json({ ok: false }, { status: 404 });
    await refreshSession(session); // le statut est relu chez MTN, jamais pris dans la notification
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

/** MTN notifie par PUT ; POST accepté aussi. */
export const PUT = handle;
export const POST = handle;
