export type Product = {
  id: number | string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number | string;
  minQuantity: number;
  archived?: boolean;
  createdAt?: string;
};

export type MovementType = "in" | "out" | "adjustment";

export type Movement = {
  id: number | string;
  type: MovementType;
  quantity: number;
  quantityBefore: number | null;
  quantityAfter: number | null;
  note: string | null;
  createdAt: string;
  productId: number | string;
  productName: string;
  productSku: string;
  userName: string | null;
};

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  in: "Entrée",
  out: "Sortie",
  adjustment: "Ajustement"
};

export const money = (value: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XAF", maximumFractionDigits: 0 }).format(value);

export const formatDate = (value: string) =>
  new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Appel JSON vers l'API : lève une ApiError avec le message du serveur en cas d'échec. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    cache: "no-store",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error || "Une erreur est survenue.", response.status);
  return data;
}
