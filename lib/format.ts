const moneyFormat = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XAF", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala"
});
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

export function money(value: number | string | null | undefined) {
  return moneyFormat.format(Number(value ?? 0));
}

export function dateTime(value: string | null | undefined) {
  return value ? dateFormat.format(new Date(value)) : "—";
}

export function dayLabel(day: string) {
  return shortDate.format(new Date(`${day}T00:00:00Z`));
}

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "Espèces",
  orange_money: "Orange Money",
  mtn_money: "MTN Money",
  card: "Carte bancaire"
};

export const MOVEMENT_LABELS: Record<string, string> = {
  in: "Entrée",
  out: "Sortie",
  adjustment: "Inventaire"
};
