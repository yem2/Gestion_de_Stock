"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Bell, Boxes, ChartNoAxesCombined,
  CircleDollarSign, ClipboardList, LayoutDashboard, Package, Plus, Settings, ShieldCheck, ShoppingCart,
  Truck, Users, X
} from "lucide-react";
import MovementModal from "@/components/movement-modal";
import MovementsView from "@/components/movements-view";
import ProductModal from "@/components/product-modal";
import ProductsView from "@/components/products-view";
import {
  ApiError, MOVEMENT_LABELS, api, formatDate, money, type Movement, type MovementType, type Product
} from "@/components/types";
import { canManageStock, canWriteStock, type Role } from "@/lib/roles";

type DashboardUser = { name: string; roleLabel: string; role: Role };
type View = "overview" | "products" | "movements";

const VIEW_TITLES: Record<View, string> = {
  overview: "Vue d’ensemble",
  products: "Produits",
  movements: "Mouvements de stock"
};

type LoadedData = {
  products: Product[] | null;
  productsError: string;
  movements: Movement[] | null;
  movementsError: string;
  unauthorized: boolean;
};

/** Charge produits et mouvements sans toucher à l'état React (les mouvements ne bloquent pas l'affichage des produits). */
async function loadData(canWrite: boolean): Promise<LoadedData> {
  const [p, m] = await Promise.allSettled([
    api<{ products: Product[] }>("/api/products"),
    canWrite ? api<{ movements: Movement[] }>("/api/movements?limit=100") : Promise.resolve({ movements: [] as Movement[] })
  ]);
  const message = (r: PromiseRejectedResult, fallback: string) => (r.reason instanceof Error ? r.reason.message : fallback);
  return {
    products: p.status === "fulfilled" ? p.value.products : null,
    productsError: p.status === "rejected" ? message(p, "Connexion impossible.") : "",
    movements: m.status === "fulfilled" ? m.value.movements : null,
    movementsError: m.status === "rejected" ? message(m, "Chargement impossible.") : "",
    unauthorized: [p, m].some((r) => r.status === "rejected" && r.reason instanceof ApiError && r.reason.status === 401)
  };
}

export default function StockDashboard({ user }: { user: DashboardUser }) {
  const router = useRouter();
  const canWrite = canWriteStock(user.role);
  const canManage = canManageStock(user.role);
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";

  const [view, setView] = useState<View>("overview");
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [movementsError, setMovementsError] = useState("");
  const [notice, setNotice] = useState("");
  const [productModal, setProductModal] = useState<{ product: Product | null } | null>(null);
  const [movementModal, setMovementModal] = useState<{ productId?: string; type?: MovementType } | null>(null);

  const applyData = useCallback((data: LoadedData) => {
    if (data.unauthorized) { router.push("/login"); return; }
    if (data.products) { setProducts(data.products); setError(""); }
    else setError(data.productsError);
    if (data.movements) { setMovements(data.movements); setMovementsError(""); }
    else setMovementsError(data.movementsError);
    setLoading(false);
  }, [router]);

  const refresh = useCallback(async () => { applyData(await loadData(canWrite)); }, [applyData, canWrite]);

  useEffect(() => {
    let alive = true;
    void loadData(canWrite).then((data) => { if (alive) applyData(data); });
    return () => { alive = false; };
  }, [applyData, canWrite]);

  function reload() {
    setLoading(true);
    void refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function saved(message: string) {
    setProductModal(null);
    setMovementModal(null);
    setNotice(message);
    void refresh();
  }

  const totalUnits = products.reduce((sum, p) => sum + Number(p.quantity), 0);
  const stockValue = products.reduce((sum, p) => sum + Number(p.quantity) * Number(p.unitPrice), 0);
  const lowList = products.filter((p) => Number(p.quantity) <= Number(p.minQuantity));
  const lowStock = lowList.length;

  const nav: { label: string; icon: typeof Package; view?: View; hidden?: boolean }[] = [
    { label: "Vue d’ensemble", icon: LayoutDashboard, view: "overview" },
    { label: "Produits", icon: Package, view: "products" },
    { label: "Mouvements de stock", icon: Activity, view: "movements", hidden: !canWrite },
    { label: "Ventes", icon: ShoppingCart },
    { label: "Fournisseurs", icon: Truck },
    { label: "Clients", icon: Users },
    { label: "Rapports", icon: ChartNoAxesCombined }
  ];
  const visibleNav = nav.filter((item) => !item.hidden);

  function go(item: (typeof nav)[number]) {
    if (item.view) { setView(item.view); setNotice(""); }
    else setNotice(`${item.label} : module prévu dans une prochaine étape.`);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Boxes size={23} /></div>
          <div><strong>Gestion de Stock</strong><span>GESTION COMMERCIALE</span></div>
        </div>
        <div className="workspace-label">ESPACE DE TRAVAIL</div>
        <nav className="nav-list">
          {visibleNav.map((item) => (
            <button key={item.label} className={`nav-item ${item.view === view ? "active" : ""}`} type="button" onClick={() => go(item)}>
              <item.icon size={18} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" type="button" onClick={() => setNotice("L’écran de gestion des utilisateurs arrive bientôt (l’API est déjà prête).")}><ShieldCheck size={18} /><span>Utilisateurs & rôles</span></button>
          <button className="nav-item" type="button" onClick={() => setNotice("Paramètres : module prévu dans une prochaine étape.")}><Settings size={18} /><span>Paramètres</span></button>
          <div className="plan-card">
            <div className="plan-icon"><ClipboardList size={18} /></div>
            <strong>Votre espace stock</strong>
            <p>Suivez vos produits et chaque mouvement de stock au même endroit.</p>
            <span className="plan-status"><i /> {lowStock > 0 ? `${lowStock} alerte(s) de stock` : "Aucune alerte de stock"}</span>
          </div>
          <div className="user-card">
            <div className="avatar">{initials}</div>
            <div className="user-info"><strong>{user.name}</strong><span>{user.roleLabel}</span></div>
          </div>
          <button type="button" className="logout-btn" onClick={() => void logout()}>Déconnexion</button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="crumb"><span>Gestion de Stock</span><span className="slash">/</span><strong>{VIEW_TITLES[view]}</strong></div>
          <div className="top-actions">
            <div className="environment-pill"><i /> Espace de travail</div>
            <button className="icon-button" aria-label="Notifications" type="button" onClick={() => setNotice(lowStock ? `${lowStock} produit(s) au seuil minimum.` : "Aucune alerte de stock pour le moment.")}><Bell size={18} />{lowStock > 0 && <b />}</button>
            <div className="top-avatar">{initials}</div>
          </div>
        </header>

        <nav className="mobile-nav" aria-label="Navigation">
          {visibleNav.filter((item) => item.view).map((item) => (
            <button key={item.label} type="button" className={item.view === view ? "active" : ""} onClick={() => go(item)}><item.icon size={15} /> {item.label}</button>
          ))}
          <button type="button" onClick={() => void logout()}>Déconnexion</button>
        </nav>

        <div className="content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">TABLEAU DE PILOTAGE</div>
              <h1>{VIEW_TITLES[view]}</h1>
              <p className="subtitle">Gardez un œil sur votre stock, vos produits et vos opérations.</p>
            </div>
            <div className="row-actions">
              {canWrite && <button className="secondary-button" type="button" onClick={() => setMovementModal({})}><ArrowLeftRight size={18} /> Mouvement</button>}
              {canWrite && <button className="primary-button" type="button" onClick={() => setProductModal({ product: null })}><Plus size={18} /> Nouveau produit</button>}
            </div>
          </div>

          {notice && <div className="notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Fermer"><X size={16} /></button></div>}
          {error && <div className="error-banner"><AlertTriangle size={18} /><div><strong>Chargement des produits impossible</strong><p>{error}</p><span>Vérifiez DATABASE_URL et les migrations SQL (db/0000 à 0002) dans votre base Neon.</span></div><button type="button" onClick={reload}>Réessayer</button></div>}

          {view === "overview" && (
            <>
              <div className="stats-grid">
                <article className="stat-card">
                  <div className="stat-top"><span>Références produits</span><span className="stat-icon violet"><Package size={19} /></span></div>
                  <div className="stat-value">{loading ? "—" : products.length.toLocaleString("fr-FR")}</div>
                  <div className="stat-foot"><span className="muted-dot" /> Produits actifs</div>
                </article>
                <article className="stat-card">
                  <div className="stat-top"><span>Unités en stock</span><span className="stat-icon blue"><Boxes size={19} /></span></div>
                  <div className="stat-value">{loading ? "—" : totalUnits.toLocaleString("fr-FR")}</div>
                  <div className="stat-foot"><span className="positive-mark"><ArrowUpFromLine size={13} /></span> Quantité disponible</div>
                </article>
                <article className="stat-card">
                  <div className="stat-top"><span>Valeur du stock</span><span className="stat-icon green"><CircleDollarSign size={19} /></span></div>
                  <div className="stat-value stat-money">{loading ? "—" : money(stockValue)}</div>
                  <div className="stat-foot"><span className="muted-dot" /> Valorisation au prix unitaire</div>
                </article>
                <article className="stat-card">
                  <div className="stat-top"><span>Stock à surveiller</span><span className="stat-icon amber"><AlertTriangle size={19} /></span></div>
                  <div className="stat-value">{loading ? "—" : lowStock.toLocaleString("fr-FR")}</div>
                  <div className="stat-foot"><span className={lowStock ? "warning-mark" : "positive-mark"}>{lowStock ? "À vérifier" : "Tout va bien"}</span></div>
                </article>
              </div>

              <div className="bottom-grid">
                <section className="mini-panel">
                  <div className="mini-heading"><div><h3>Activité récente</h3><p>Les derniers mouvements de stock</p></div><Activity size={18} /></div>
                  {!canWrite ? (
                    <div className="placeholder-row"><div className="activity-symbol"><ArrowUpFromLine size={16} /></div><div><strong>Historique réservé</strong><span>Les mouvements sont visibles par le magasinier et au-dessus.</span></div></div>
                  ) : movements.length === 0 ? (
                    <div className="placeholder-row"><div className="activity-symbol"><ArrowUpFromLine size={16} /></div><div><strong>{movementsError ? "Mouvements indisponibles" : "Aucun mouvement pour le moment"}</strong><span>{movementsError || "Entrées, sorties et ajustements de stock apparaîtront ici."}</span></div></div>
                  ) : movements.slice(0, 5).map((m) => (
                    <div className="placeholder-row" key={m.id}>
                      <div className={`activity-symbol ${m.type === "out" ? "warm" : ""}`}>{m.type === "out" ? <ArrowUpFromLine size={16} /> : m.type === "in" ? <ArrowDownToLine size={16} /> : <ArrowLeftRight size={16} />}</div>
                      <div><strong>{MOVEMENT_LABELS[m.type]} · {m.productName}</strong><span>{m.type === "in" ? "+" : m.type === "out" ? "−" : "±"}{Number(m.quantity).toLocaleString("fr-FR")} · {formatDate(m.createdAt)}{m.userName ? ` · ${m.userName}` : ""}</span></div>
                    </div>
                  ))}
                  {canWrite && movements.length > 0 && <button type="button" className="text-button" onClick={() => setView("movements")}>Voir tous les mouvements</button>}
                </section>
                <section className="mini-panel alert-panel">
                  <div className="mini-heading"><div><h3>Centre d’alertes</h3><p>Produits nécessitant votre attention</p></div><Bell size={18} /></div>
                  {lowStock === 0 ? (
                    <div className="all-good"><ShieldCheck size={22} /><div><strong>Aucune alerte de stock</strong><span>Tous les produits sont au-dessus de leur seuil minimum.</span></div></div>
                  ) : lowList.slice(0, 5).map((p) => (
                    <div className="alert-content" key={p.id}>
                      <div className="alert-circle"><AlertTriangle size={18} /></div>
                      <div><strong>{p.name}</strong><span>{Number(p.quantity).toLocaleString("fr-FR")} en stock · seuil {Number(p.minQuantity).toLocaleString("fr-FR")}</span></div>
                      {canWrite && <button type="button" className="mini-btn push-right" onClick={() => setMovementModal({ productId: String(p.id), type: "in" })}>Réapprovisionner</button>}
                    </div>
                  ))}
                  {lowStock > 5 && <button type="button" className="text-button" onClick={() => setView("products")}>Voir les {lowStock} produits concernés</button>}
                </section>
              </div>
            </>
          )}

          {view === "products" && (
            <ProductsView
              products={products} loading={loading} canWrite={canWrite} canManage={canManage}
              onCreate={() => setProductModal({ product: null })}
              onEdit={(product) => setProductModal({ product })}
              onMove={(product) => setMovementModal({ productId: String(product.id) })}
              onRefresh={reload} onNotice={setNotice}
            />
          )}

          {view === "movements" && canWrite && (
            <MovementsView movements={movements} loading={loading} error={movementsError} canWrite={canWrite} onNew={() => setMovementModal({})} onRefresh={reload} />
          )}

          <footer className="footer"><span>© 2026 Gestion de Stock</span><span>Application en développement · XAF / FCFA</span></footer>
        </div>
      </section>

      {productModal && <ProductModal product={productModal.product} onClose={() => setProductModal(null)} onSaved={saved} />}
      {movementModal && (
        <MovementModal
          products={products} presetProductId={movementModal.productId} presetType={movementModal.type}
          canAdjust={canManage} onClose={() => setMovementModal(null)} onSaved={saved}
        />
      )}
    </main>
  );
}
