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

/** Traduit les erreurs levées par approve_inventory_count. */
export function inventoryFailure(error: unknown) {
  const text = errorText(error);
  if (/INVENTORY_NOT_FOUND/.test(text)) return fail("Inventaire introuvable.", 404);
  if (/INVENTORY_BAD_STATUS/.test(text)) return fail("Cet inventaire n’est pas dans un état qui permet cette action.", 409);
  if (/INVENTORY_STOCK_CHANGED/.test(text) || isCheckViolation(error)) {
    return fail("Le stock a changé depuis le comptage : un écart négatif ne peut plus être appliqué. Annulez cet inventaire et recommencez.", 409);
  }
  return null;
}

/** Traduit les erreurs levées par receive_purchase. */
export function purchaseFailure(error: unknown) {
  const text = errorText(error);
  if (/PURCHASE_NOT_FOUND/.test(text)) return fail("Commande introuvable.", 404);
  if (/PURCHASE_BAD_STATUS/.test(text)) return fail("Cette commande n’est pas dans un état qui permet la réception.", 409);
  if (/RECEIPT_EMPTY/.test(text)) return fail("Saisissez au moins une quantité reçue ou rejetée.", 400);
  if (/RECEIPT_EXCEEDS/.test(text)) return fail("Une quantité dépasse ce qui reste à recevoir sur cette commande.", 409);
  if (/RECEIPT_INVALID/.test(text)) return fail("Réception invalide.", 400);
  return null;
}

/**
 * Clé d'idempotence (en-tête Idempotency-Key) : permet de rejouer sans risque une requête
 * après un double clic ou un délai dépassé. Absente = pas de protection (comportement historique).
 */
export function idempotencyKey(request: Request): { key: string | null } | { error: NextResponse } {
  const raw = request.headers.get("idempotency-key");
  if (raw === null || raw.trim() === "") return { key: null };
  const key = raw.trim();
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(key)) return { error: fail("Clé d’idempotence invalide.") };
  return { key };
}

/** Traduit les erreurs levées par record_payment, reverse_payment et settle_pending_payment. */
export function paymentFailure(error: unknown) {
  const text = errorText(error);
  if (/PAYMENT_NOT_FOUND/.test(text)) return fail("Paiement introuvable.", 404);
  if (/PAYMENT_BAD_STATUS/.test(text)) return fail("Ce paiement ne peut plus être contrepassé.", 409);
  if (/PAYMENT_METHOD_INVALID/.test(text)) return fail("Mode de paiement invalide ou désactivé.", 400);
  if (/PAYMENT_DOCUMENT_NOT_FOUND/.test(text)) return fail("Document à régler introuvable.", 404);
  if (/PAYMENT_DOCUMENT_CLOSED/.test(text)) return fail("Ce document ne peut pas être réglé dans son état actuel.", 409);
  if (/PAYMENT_PARTY_MISMATCH/.test(text)) return fail("Le document n’appartient pas à ce client ou fournisseur.", 409);
  if (/PAYMENT_EXCEEDS_DUE/.test(text)) return fail("Le montant dépasse le reste dû sur ce document.", 409);
  if (/PAYMENT_ALLOCATION_EXCEEDS/.test(text)) return fail("Le total affecté dépasse le montant du paiement.", 400);
  if (/PAYMENT_INVALID/.test(text)) return fail("Paiement invalide.", 400);
  return null;
}
