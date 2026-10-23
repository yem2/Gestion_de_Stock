"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Boxes, ChartNoAxesCombined, ClipboardList, History, LayoutDashboard, LogOut, Menu, Package, ShieldCheck,
  Settings, ShoppingCart, Truck, UserRound, Users, ArrowLeftRight, ArrowRightLeft, ClipboardCheck, Warehouse, X
} from "lucide-react";
import { can, type Permission, type Role } from "@/lib/roles";

type ShellUser = { name: string; role: Role; roleLabel: string };

const NAV: { href: string; label: string; icon: typeof Package; permission?: Permission }[] = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/produits", label: "Produits", icon: Package },
  { href: "/mouvements", label: "Mouvements", icon: ArrowLeftRight, permission: "movements.view" },
  { href: "/entrepots", label: "Entrepôts", icon: Warehouse, permission: "warehouses.view" },
  { href: "/transferts", label: "Transferts", icon: ArrowRightLeft, permission: "transfers.view" },
  { href: "/inventaires", label: "Inventaires", icon: ClipboardCheck, permission: "inventory.view" },
  { href: "/ventes", label: "Ventes", icon: ShoppingCart, permission: "sales.view" },
  { href: "/achats", label: "Achats", icon: ClipboardList, permission: "purchases.view" },
  { href: "/clients", label: "Clients", icon: Users, permission: "customers.view" },
  { href: "/fournisseurs", label: "Fournisseurs", icon: Truck, permission: "suppliers.view" },
  { href: "/rapports", label: "Rapports", icon: ChartNoAxesCombined, permission: "reports.view" },
  { href: "/utilisateurs", label: "Utilisateurs", icon: ShieldCheck, permission: "users.manage" },
  { href: "/journal", label: "Journal", icon: History, permission: "audit.view" },
  { href: "/parametres", label: "Paramètres", icon: Settings }
];

export default function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((item) => !item.permission || can(user.role, item.permission));
  const current = items.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)));
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";

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
        <nav className="nav">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item === current;
            return (
              <Link key={item.href} href={item.href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon size={19} /> <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="user-card">
          <div className="avatar">{initials}</div>
          <div className="user-info"><strong>{user.name}</strong><span>{user.roleLabel}</span></div>
          <button type="button" className="logout-icon" onClick={logout} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={18} /></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><Menu size={22} /></button>
          <h2 className="topbar-title">{current?.label ?? "Gestion de Stock"}</h2>
          <div className="topbar-user"><UserRound size={16} /><span>{user.name}</span></div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
