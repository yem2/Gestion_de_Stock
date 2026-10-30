"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Boxes, ChartNoAxesCombined, ClipboardList, History, LayoutDashboard, LogOut, Menu, Package, ShieldCheck,
  Settings, ShoppingCart, Truck, Users, ArrowLeftRight, ArrowRightLeft, ClipboardCheck, Wallet, Warehouse, X
} from "lucide-react";
import { type Permission, type Role } from "@/lib/roles";
import Avatar from "@/components/avatar";
import InstallMenuButton from "@/components/install-menu-button";

type ShellUser = { id: number; avatarVersion: number | null; name: string; role: Role; roleLabel: string; allowed: Permission[] };

const NAV: { href: string; label: string; icon: typeof Package; permission?: Permission }[] = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/produits", label: "Produits", icon: Package },
  { href: "/mouvements", label: "Mouvements", icon: ArrowLeftRight, permission: "movements.view" },
  { href: "/entrepots", label: "Entrepôts", icon: Warehouse, permission: "warehouses.view" },
  { href: "/transferts", label: "Transferts", icon: ArrowRightLeft, permission: "transfers.view" },
  { href: "/inventaires", label: "Inventaires", icon: ClipboardCheck, permission: "inventory.view" },
  { href: "/paiements", label: "Paiements", icon: Wallet, permission: "payments.view" },
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
  // Le menu mobile se referme tout seul à chaque changement de page (l'état est lié au chemin courant).
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = (value: boolean) => setOpenPath(value ? pathname : null);
  const items = NAV.filter((item) => !item.permission || user.allowed.includes(item.permission));
  const current = items.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)));

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
        <InstallMenuButton />
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
          <div className="topbar-user"><Avatar userId={user.id} name={user.name} version={user.avatarVersion} size={26} /><span>{user.name}</span></div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
