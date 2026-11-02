"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Boxes, ChartNoAxesCombined, ClipboardList, History, LayoutDashboard, LogOut, Menu, Package, ShieldCheck,
  Settings, ShoppingCart, Truck, Users, ArrowLeftRight, ArrowRightLeft, ChevronDown, ClipboardCheck, Landmark, Wallet, Warehouse, X
} from "lucide-react";
import { type Permission, type Role } from "@/lib/roles";
import Avatar from "@/components/avatar";
import NotificationBell from "@/components/notification-bell";

type ShellUser = { id: number; avatarVersion: number | null; name: string; role: Role; roleLabel: string; allowed: Permission[] };

type NavItem = { href: string; label: string; icon: typeof Package; permission?: Permission };

/** Menu regroupé par grand module : les pages qui vont ensemble partagent la même section. */
const NAV_GROUPS: { id: string; label?: string; items: NavItem[] }[] = [
  { id: "main", items: [{ href: "/", label: "Tableau de bord", icon: LayoutDashboard }] },
  {
    id: "stock", label: "Stock",
    items: [
      { href: "/produits", label: "Produits", icon: Package },
      { href: "/mouvements", label: "Mouvements", icon: ArrowLeftRight, permission: "movements.view" },
      { href: "/entrepots", label: "Entrepôts", icon: Warehouse, permission: "warehouses.view" },
      { href: "/transferts", label: "Transferts", icon: ArrowRightLeft, permission: "transfers.view" },
      { href: "/inventaires", label: "Inventaires", icon: ClipboardCheck, permission: "inventory.view" }
    ]
  },
  {
    id: "sales", label: "Ventes",
    items: [
      { href: "/ventes", label: "Ventes", icon: ShoppingCart, permission: "sales.view" },
      { href: "/clients", label: "Clients", icon: Users, permission: "customers.view" }
    ]
  },
  {
    id: "purchases", label: "Achats",
    items: [
      { href: "/achats", label: "Achats", icon: ClipboardList, permission: "purchases.view" },
      { href: "/fournisseurs", label: "Fournisseurs", icon: Truck, permission: "suppliers.view" }
    ]
  },
  {
    id: "finance", label: "Finance",
    items: [
      { href: "/paiements", label: "Paiements", icon: Wallet, permission: "payments.view" },
      { href: "/finance", label: "Trésorerie et marges", icon: Landmark, permission: "finance.view" },
      { href: "/rapports", label: "Rapports", icon: ChartNoAxesCombined, permission: "reports.view" }
    ]
  },
  {
    id: "admin", label: "Administration",
    items: [
      { href: "/utilisateurs", label: "Utilisateurs", icon: ShieldCheck, permission: "users.manage" },
      { href: "/journal", label: "Journal", icon: History, permission: "audit.view" },
      { href: "/parametres", label: "Paramètres", icon: Settings }
    ]
  }
];

const NAV: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
const COLLAPSE_KEY = "nav-collapsed";

export default function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = (item: NavItem) => !item.permission || user.allowed.includes(item.permission);
  const items = NAV.filter(visible);
  const current = items.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)));
  const [collapsed, setCollapsed] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(COLLAPSE_KEY) ?? "[]");
      if (Array.isArray(saved)) setCollapsed(saved.filter((id): id is string => typeof id === "string"));
    } catch {
      // préférence illisible : tout reste déplié
    }
  }, []);

  function toggleGroup(id: string) {
    setCollapsed((current) => {
      const next = current.includes(id) ? current.filter((g) => g !== id) : [...current, id];
      try { window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
      return next;
    });
  }

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("no-scroll", open);
    return () => document.body.classList.remove("no-scroll");
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="app">
      <div className={`scrim${open ? " show" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="Navigation principale">
        <div className="side-head">
          <div className="brand">
            <span className="brand-mark"><Boxes size={22} /></span>
            <div><strong>Gestion de Stock</strong><span>Gestion commerciale</span></div>
          </div>
          <button type="button" className="icon-btn side-close" onClick={() => setOpen(false)} aria-label="Fermer le menu"><X size={20} /></button>
        </div>
        <nav className="nav" aria-label="Navigation principale">
          {NAV_GROUPS.map((group) => {
            const groupItems = group.items.filter(visible);
            if (groupItems.length === 0) return null;
            const hasCurrent = groupItems.some((item) => item === current);
            // le groupe de la page affichée reste toujours ouvert
            const isCollapsed = Boolean(group.label) && collapsed.includes(group.id) && !hasCurrent;
            return (
              <div className="nav-group" key={group.id}>
                {group.label && (
                  <button type="button" className="nav-group-title" onClick={() => toggleGroup(group.id)} aria-expanded={!isCollapsed}>
                    <span>{group.label}</span>
                    <ChevronDown size={14} className={isCollapsed ? "nav-chevron is-collapsed" : "nav-chevron"} aria-hidden="true" />
                  </button>
                )}
                {!isCollapsed && groupItems.map((item) => {
                  const Icon = item.icon;
                  const active = item === current;
                  return (
                    <Link key={item.href} href={item.href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                      <Icon size={19} /> <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="user-card">
          <Avatar userId={user.id} name={user.name} version={user.avatarVersion} />
          <div className="user-info"><strong>{user.name}</strong><span>{user.roleLabel}</span></div>
          <button type="button" className="logout-icon" onClick={logout} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={18} /></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><Menu size={22} /></button>
          <h2 className="topbar-title">{current?.label ?? "Gestion de Stock"}</h2>
          <NotificationBell />
          <div className="topbar-user"><Avatar userId={user.id} name={user.name} version={user.avatarVersion} size={26} /><span>{user.name}</span></div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
