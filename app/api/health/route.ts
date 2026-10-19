import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const auth = (process.env.AUTH_SECRET?.length ?? 0) >= 32 ? "configured" : "misconfigured";
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    return NextResponse.json(
      { status: auth === "configured" ? "ok" : "error", database: "connected", auth },
      { status: auth === "configured" ? 200 : 503 }
    );
  } catch {
    return NextResponse.json(
      { status: "error", database: process.env.DATABASE_URL ? "unavailable" : "not_configured", auth },
      { status: 503 }
    );
  }
}
