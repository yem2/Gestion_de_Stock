"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi } from "@/lib/client";
import { dateTime } from "@/lib/format";
import { Alert, Empty, Loading, PageHeader } from "@/components/ui";
import type { NotificationItem } from "@/components/notification-bell";

const SEVERITY: Record<NotificationItem["severity"], string> = { info: "badge-muted", warning: "badge-warn", danger: "badge-danger", success: "badge-ok" };
const TYPE_LABEL: Record<string, string> = {
  stock_low: "Stock bas", stock_out: "Rupture", purchase_approval: "Achat à approuver", expense_approval: "Dépense à approuver",
  inventory_approval: "Inventaire à approuver", payment_failed: "Paiement échoué"
};

export default function NotificationsView() {
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const list = useApi<{ notifications: NotificationItem[]; unread: number }>(`/api/notifications?limit=100${unreadOnly ? "&unread=1" : ""}`);
  const [error, setError] = useState("");

  async function markRead(body: { ids?: string[]; all?: boolean }) {
    setError("");
    try {
      await api("/api/notifications/read", { method: "POST", body: JSON.stringify(body) });
      await list.reload();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    }
  }

  const items = list.data?.notifications ?? [];
  return (
    <>
      <PageHeader title="Notifications" subtitle="Alertes de stock et demandes qui attendent votre action.">
        {(list.data?.unread ?? 0) > 0 && <button type="button" className="btn" onClick={() => markRead({ all: true })}>Tout marquer comme lu</button>}
      </PageHeader>
      {error && <Alert>{error}</Alert>}
      <div className="chip-row" style={{ marginBottom: 14 }}>
        <button type="button" className={`chip${!unreadOnly ? " active" : ""}`} onClick={() => setUnreadOnly(false)}>Toutes</button>
        <button type="button" className={`chip${unreadOnly ? " active" : ""}`} onClick={() => setUnreadOnly(true)}>Non lues{(list.data?.unread ?? 0) > 0 ? ` (${list.data?.unread})` : ""}</button>
      </div>
      {list.loading && !list.data ? <Loading /> : items.length === 0 ? <Empty>{unreadOnly ? "Aucune notification non lue." : "Aucune notification pour l’instant."}</Empty> : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>Type</th><th>Message</th><th>Date</th><th /></tr></thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id} style={n.read ? { opacity: 0.65 } : undefined}>
                  <td data-label="Type"><span className={`badge ${SEVERITY[n.severity]}`}>{TYPE_LABEL[n.type] ?? n.title ?? "Notification"}</span></td>
                  <td data-label="Message">{n.body ?? n.title}</td>
                  <td data-label="Date">{dateTime(n.createdAt)}</td>
                  <td className="actions">
                    {n.link && <button type="button" className="btn btn-sm" onClick={async () => { if (!n.read) await markRead({ ids: [n.id] }); router.push(n.link as string); }}>Ouvrir</button>}
                    {!n.read && <button type="button" className="btn btn-sm" onClick={() => markRead({ ids: [n.id] })}>Marquer lue</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </>
  );
}
