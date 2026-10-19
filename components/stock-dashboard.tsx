"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Bell, Boxes,
  ChartNoAxesCombined, ChevronDown, CircleDollarSign, ClipboardList, LayoutDashboard,
  Menu, Package, Plus, Search, Settings, ShieldCheck, ShoppingCart, Truck, Users, X
} from "lucide-react";

type Product = {
  id: number | string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number | string;
  minQuantity: number;
  createdAt?: string;
};

const money = (value: number) => new Intl.NumberFormat("fr-FR", {
  style: "currency", currency: "XAF", maximumFractionDigits: 0
}).format(value);

export default function StockDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    sku: "", name: "", category: "Général", quantity: "0", unitPrice: "0", minQuantity: "0"
  });

  async function loadProducts() {
    setLoading(true);
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chargement impossible.");
      setProducts(data.products || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProducts(); }, []);

  const filtered = useMemo(() => products.filter((p) =>
    `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(query.toLowerCase())
  ), [products, query]);

  const totalUnits = products.reduce((sum, p) => sum + Number(p.quantity), 0);
  const stockValue = products.reduce((sum, p) => sum + Number(p.quantity) * Number(p.unitPrice), 0);
  const lowStock = products.filter((p) => Number(p.quantity) <= Number(p.minQuantity)).length;

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
          unitPrice: Number(form.unitPrice),
          minQuantity: Number(form.minQuantity)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Enregistrement impossible.");
      setProducts((current) => [data.product, ...current]);
      setShowForm(false);
      setForm({ sku: "", name: "", category: "Général", quantity: "0", unitPrice: "0", minQuantity: "0" });
      setNotice("Produit ajouté avec succès.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erreur lors de l’enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  const nav = [
    { label: "Vue d’ensemble", icon: LayoutDashboard, active: true },
    { label: "Produits", icon: Package },
    { label: "Mouvements de stock", icon: Activity },
    { label: "Ventes", icon: ShoppingCart },
    { label: "Fournisseurs", icon: Truck },
    { label: "Clients", icon: Users },
    { label: "Rapports", icon: ChartNoAxesCombined }
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Boxes size={23} /></div>
          <div><strong>StockPilot</strong><span>GESTION COMMERCIALE</span></div>
        </div>
        <div className="workspace-label">ESPACE DE TRAVAIL</div>
        <nav className="nav-list">
          {nav.map(({ label, icon: Icon, active }) => (
            <button key={label} className={`nav-item ${active ? "active" : ""}`} type="button"
              onClick={() => label !== "Vue d’ensemble" && setNotice(`${label} : module prévu dans la prochaine étape.`)}>
              <Icon size={18} /><span>{label}</span>
              {label === "Mouvements de stock" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" type="button" onClick={() => setNotice("La gestion des utilisateurs sera activée avec le module d’authentification.")}><ShieldCheck size={18} /><span>Utilisateurs & rôles</span></button>
          <button className="nav-item" type="button" onClick={() => setNotice("Paramètres : module prévu dans la prochaine étape.")}><Settings size={18} /><span>Paramètres</span></button>
          <div className="plan-card">
            <div className="plan-icon"><ClipboardList size={18} /></div>
            <strong>Votre espace stock</strong>
            <p>Configurez votre inventaire et suivez vos opérations au même endroit.</p>
            <span className="plan-status"><i /> Projet en initialisation</span>
          </div>
          <div className="user-card">
            <div className="avatar">AD</div>
            <div className="user-info"><strong>Administrateur</strong><span>Compte à configurer</span></div>
            <ChevronDown size={16} />
          </div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="crumb"><span>Gestion de Stock</span><span className="slash">/</span><strong>Vue d’ensemble</strong></div>
          <div className="top-actions">
            <div className="environment-pill"><i /> Espace de travail</div>
            <button className="icon-button" aria-label="Notifications" type="button" onClick={() => setNotice(lowStock ? `${lowStock} produit(s) au seuil minimum.` : "Aucune alerte de stock pour le moment.")}><Bell size={18}/>{lowStock > 0 && <b />}</button>
            <div className="top-avatar">AD</div>
          </div>
        </header>

        <div className="content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">TABLEAU DE PILOTAGE</div>
              <h1>Vue d’ensemble</h1>
              <p className="subtitle">Gardez un œil sur votre stock, vos produits et vos opérations.</p>
            </div>
            <button className="primary-button" type="button" onClick={() => setShowForm(true)}><Plus size={18}/> Nouveau produit</button>
          </div>

          {notice && <div className="notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Fermer"><X size={16}/></button></div>}
          {error && <div className="error-banner"><AlertTriangle size={18}/><div><strong>Connexion à la base de données indisponible</strong><p>{error}</p><span>Configurez DATABASE_URL dans votre environnement Neon pour activer les données.</span></div><button type="button" onClick={() => void loadProducts()}>Réessayer</button></div>}

          <div className="stats-grid">
            <article className="stat-card">
              <div className="stat-top"><span>Références produits</span><span className="stat-icon violet"><Package size={19}/></span></div>
              <div className="stat-value">{loading ? "—" : products.length.toLocaleString("fr-FR")}</div>
              <div className="stat-foot"><span className="muted-dot" /> Produits enregistrés</div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Unités en stock</span><span className="stat-icon blue"><Boxes size={19}/></span></div>
              <div className="stat-value">{loading ? "—" : totalUnits.toLocaleString("fr-FR")}</div>
              <div className="stat-foot"><span className="positive-mark"><ArrowUpFromLine size={13}/></span> Quantité disponible</div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Valeur du stock</span><span className="stat-icon green"><CircleDollarSign size={19}/></span></div>
              <div className="stat-value stat-money">{loading ? "—" : money(stockValue)}</div>
              <div className="stat-foot"><span className="muted-dot" /> Valorisation au prix unitaire</div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Stock à surveiller</span><span className="stat-icon amber"><AlertTriangle size={19}/></span></div>
              <div className="stat-value">{loading ? "—" : lowStock.toLocaleString("fr-FR")}</div>
              <div className="stat-foot"><span className={lowStock ? "warning-mark" : "positive-mark"}>{lowStock ? "À vérifier" : "Tout va bien"}</span></div>
            </article>
          </div>

          <section className="table-panel">
            <div className="panel-heading">
              <div><h2>Inventaire des produits</h2><p>Les produits enregistrés dans votre base de données Neon.</p></div>
              <button className="secondary-button" type="button" onClick={() => void loadProducts()}><Activity size={16}/> Actualiser</button>
            </div>
            <div className="table-toolbar">
              <div className="search-box"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un produit, une référence..." aria-label="Rechercher des produits"/></div>
              <div className="table-count">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</div>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>PRODUIT</th><th>RÉFÉRENCE</th><th>CATÉGORIE</th><th>QUANTITÉ</th><th>PRIX UNITAIRE</th><th>STATUT</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={6} className="empty-state">Chargement des produits…</td></tr> :
                    filtered.length === 0 ? <tr><td colSpan={6} className="empty-state"><div className="empty-icon"><Package size={22}/></div><strong>{query ? "Aucun résultat" : "Votre inventaire est vide"}</strong><span>{query ? "Essayez une autre recherche." : "Ajoutez votre premier produit pour commencer à suivre votre stock."}</span>{!query && <button type="button" className="text-button" onClick={() => setShowForm(true)}>Ajouter un produit <ArrowDownToLine size={14}/></button>}</td></tr> :
                    filtered.map((p) => {
                      const low = Number(p.quantity) <= Number(p.minQuantity);
                      return <tr key={p.id}>
                        <td><div className="product-cell"><div className="product-thumb"><Package size={17}/></div><strong>{p.name}</strong></div></td>
                        <td><span className="sku">{p.sku}</span></td><td><span className="category-pill">{p.category}</span></td>
                        <td><strong>{Number(p.quantity).toLocaleString("fr-FR")}</strong><span className="unit-label"> unités</span></td>
                        <td>{money(Number(p.unitPrice))}</td>
                        <td><span className={`status-pill ${low ? "status-low" : "status-ok"}`}><i/>{low ? "Stock bas" : "Disponible"}</span></td>
                      </tr>;
                    })}
                </tbody>
              </table>
            </div>
            <div className="table-footer"><span>Affichage des produits disponibles</span><span><i className="footer-dot"/> Données reliées à Neon lorsque configuré</span></div>
          </section>

          <div className="bottom-grid">
            <section className="mini-panel">
              <div className="mini-heading"><div><h3>Activité récente</h3><p>Suivi des dernières opérations</p></div><Activity size={18}/></div>
              <div className="placeholder-row"><div className="activity-symbol"><ArrowUpFromLine size={16}/></div><div><strong>Les mouvements apparaîtront ici</strong><span>Entrées, sorties et ajustements de stock</span></div></div>
              <div className="placeholder-row"><div className="activity-symbol warm"><ShoppingCart size={16}/></div><div><strong>Suivi des ventes</strong><span>Les ventes seront liées à l’inventaire</span></div></div>
            </section>
            <section className="mini-panel alert-panel">
              <div className="mini-heading"><div><h3>Centre d’alertes</h3><p>Produits nécessitant votre attention</p></div><Bell size={18}/></div>
              {lowStock > 0 ? <div className="alert-content"><div className="alert-circle"><AlertTriangle size={18}/></div><div><strong>{lowStock} référence(s) à surveiller</strong><span>La quantité est au seuil minimum ou en dessous.</span></div></div> : <div className="all-good"><ShieldCheck size={22}/><div><strong>Aucune alerte de stock</strong><span>Les seuils seront évalués à partir des produits enregistrés.</span></div></div>}
            </section>
          </div>
          <footer className="footer"><span>© 2026 Gestion de Stock</span><span>Application en développement · XAF / FCFA</span></footer>
        </div>
      </section>

      {showForm && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-heading"><div><div className="eyebrow">INVENTAIRE</div><h2 id="modal-title">Ajouter un produit</h2><p>Renseignez les informations de votre article.</p></div><button className="icon-button" type="button" onClick={() => setShowForm(false)} aria-label="Fermer"><X size={18}/></button></div>
          <form onSubmit={createProduct}>
            <label>Nom du produit<input required minLength={2} maxLength={160} value={form.name} onChange={(e) => setForm({...form, name:e.target.value})} placeholder="Ex. Routeur Wi-Fi"/></label>
            <div className="form-grid">
              <label>Référence / SKU<input required maxLength={80} value={form.sku} onChange={(e) => setForm({...form, sku:e.target.value})} placeholder="Ex. ROU-001"/></label>
              <label>Catégorie<input maxLength={100} value={form.category} onChange={(e) => setForm({...form, category:e.target.value})} placeholder="Ex. Réseau"/></label>
              <label>Quantité initiale<input required type="number" min="0" step="1" value={form.quantity} onChange={(e) => setForm({...form, quantity:e.target.value})}/></label>
              <label>Prix unitaire (FCFA)<input required type="number" min="0" step="1" value={form.unitPrice} onChange={(e) => setForm({...form, unitPrice:e.target.value})}/></label>
              <label className="full-width">Seuil d’alerte de stock<input required type="number" min="0" step="1" value={form.minQuantity} onChange={(e) => setForm({...form, minQuantity:e.target.value})}/></label>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Annuler</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : <><Plus size={17}/> Enregistrer le produit</>}</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
