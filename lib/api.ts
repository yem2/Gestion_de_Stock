import { NextResponse } from "next/server";
import type { z } from "zod";

export function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export function serverError(message = "Erreur serveur.") {
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S
): Promise<{ data: z.infer<S> } | { error: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: fail("Corps JSON invalide.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { error: fail(parsed.error.issues[0]?.message ?? "Données invalides.") };
  }
  return { data: parsed.data as z.infer<S> };
}

export function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "";
}

export function isUnique(error: unknown) {
  return /unique|duplicate/i.test(errorText(error));
}

export function isForeignKey(error: unknown) {
  return /foreign key/i.test(errorText(error));
}
