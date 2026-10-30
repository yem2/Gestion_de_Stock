"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { api } from "@/lib/client";
import { dateTime } from "@/lib/format";

export type NotificationItem = {
  id: string; type: string; title: string | null; body: string | null; link: string | null;
  severity: "info" | "warning" | "danger" | "success"; read: boolean; createdAt: string;
};

/** Cloche des notifications : compteur de non lues, aperçu, lecture au clic. Se rafraîchit toutes les 60 s. */
export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ notifications: NotificationItem[]; unread: number }>("/api/notifications?limit=8");
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      // erreur réseau passagère : on garde l'affichage précédent
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function markRead(body: { ids?: string[]; all?: boolean }) {
    try {
      await api("/api/notifications/read", { method: "POST", body: JSON.stringify(body) });
      await load();
    } catch {
      // sans gravité
    }
  }

  async function openItem(item: NotificationItem) {
    setOpen(false);
    if (!item.read) await markRead({ ids: [item.id] });
    if (item.link) router.push(item.link);
  }

  return (
    <div className="bell" ref={box}>
      <button type="button" className="icon-btn bell-btn" onClick={() => { setOpen((v) => !v); if (!open) void load(); }} aria-label={unread > 0 ? `${unread} notification(s) non lue(s)` : "Notifications"} aria-expanded={open}>
        <Bell size={20} />
        {unread > 0 && <span className="bell-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread > 0 && <button type="button" className="bell-link" onClick={() => markRead({ all: true })}>Tout marquer comme lu</button>}
          </div>
          {items.length === 0 ? (
            <p className="bell-empty">Aucune notification pour l’instant.</p>
          ) : (
            <ul className="bell-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" className={`bell-item sev-${item.severity}${item.read ? " is-read" : ""}`} onClick={() => openItem(item)}>
                    <span className="bell-dot" aria-hidden="true" />
                    <span className="bell-text">
                      <span className="bell-title">{item.title ?? "Notification"}</span>
                      {item.body && <span className="bell-body">{item.body}</span>}
                      <span className="bell-time">{dateTime(item.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link className="bell-foot" href="/notifications" onClick={() => setOpen(false)}>Voir toutes les notifications</Link>
        </div>
      )}
    </div>
  );
}
