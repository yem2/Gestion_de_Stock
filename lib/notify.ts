import { getSql } from "@/lib/db";

export type NotificationInput = {
  type: string;
  title: string;
  body: string;
  link: string;
  severity: "info" | "warning" | "danger" | "success";
  /** Une notification non lue portant la même clé n'est jamais dupliquée. */
  dedupeKey?: string;
};

/**
 * Notifie tous les utilisateurs actifs de l'entreprise qui possèdent une permission.
 * Ne lève jamais d'erreur : une alerte ne doit jamais faire échouer l'opération métier qui la provoque (7.9).
 */
export async function notifyPermission(companyId: string, permission: string, n: NotificationInput) {
  try {
    await getSql()`
      SELECT notify_users(${companyId}::uuid, ${permission}::text, ${n.type}::text, ${n.title}::text, ${n.body}::text,
                          ${n.link}::text, ${n.severity}::text, ${n.dedupeKey ?? null}::text)`;
  } catch {
    // notification non critique : ignorée
  }
}
