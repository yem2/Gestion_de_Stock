import { NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionUser, logAudit } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (user) await logAudit(user.id, "logout", "user", user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
