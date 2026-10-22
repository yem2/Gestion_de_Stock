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

export function isCheckViolation(error: unknown) {
  return /check constraint/i.test(errorText(error));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

/** Message affiché quand une opération réduit le stock de l'entrepôt principal au-delà de ce qu'il contient. */
export const MAIN_WAREHOUSE_STOCK_ERROR =
  "Stock insuffisant dans l’entrepôt principal (une partie du stock se trouve peut-être dans un autre entrepôt).";

/** Traduit les erreurs levées par les fonctions SQL de transfert (ship_transfer, receive_transfer, cancel_transfer). */
export function transferFailure(error: unknown) {
  const text = errorText(error);
  if (/TRANSFER_NOT_FOUND/.test(text)) return fail("Transfert introuvable.", 404);
  if (/TRANSFER_BAD_STATUS/.test(text)) return fail("Ce transfert n’est pas dans un état qui permet cette action.", 409);
  if (/TRANSFER_EMPTY/.test(text)) return fail("Ce transfert ne contient aucune ligne.", 400);
  if (/INSUFFICIENT_STOCK/.test(text)) return fail("Stock disponible insuffisant dans l’entrepôt d’origine.", 409);
  return null;
}
