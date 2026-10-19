"use client";

import { useMemo, useState } from "react";
import { Activity, Archive, ArrowDownToLine, ArrowLeftRight, Package, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { api, money, type Product } from "@/components/types";

type Props = {
  products: Product[];
  loading: boolean;
  canWrite: boolean;
  canManage: boolean;
  onCreate: () => void;
  onEdit: (product: Product) => void;
  onMove: (product: Product) => void;
  onRefresh: () => void;
  onNotice: (message: string) => void;
};

export default function ProductsView({ products, loading, canWrite, canManage, onCreate, onEdit, onMove, onRefresh, onNotice }: Props) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<Product[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);

  async function loadArchived() {
    try {
      const data = await api<{ products: Product[] }>("/api/products?archived=1");
      setArchived(data.products);
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setLoadingArchived(false);
    }
  }

  function toggleArchived() {
    const next = !showArchived;
    setShowArchived(next);
    setQuery("");
    if (next) {
      setLoadingArchived(true);
      void loadArchived();
    }
  }

  async function setArchivedFlag(product: Product, value: boolean) {
    if (value && !window.confirm(`Archiver « ${product.name} » ? Il disparaîtra de l’inventaire actif (l’historique est conservé).`)) return;
    try {
      await api(`/api/products/${product.id}`, { method: "PATCH", body: { archived: value } });
      onNotice(value ? "Produit archivé." : "Produit restauré.");
      onRefresh();
      if (showArchived) await loadArchived();
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Action impossible.");
    }
  }

  const list = showArchived ? archived : products;
  const filtered = useMemo(
    () => list.filter((p) => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(query.toLowerCase())),
    [list, query]
  );
  const busy = showArchived ? loadingArchived : loading;

  return (
    <section className="table-panel">
      <div className="panel-heading">
        <div>
          <h2>{showArchived ? "Produits archivés" : "Inventaire des produits"}</h2>
          <p>{showArchived ? "Produits retirés de l’inventaire actif. Ils peuvent être restaurés." : "Les produits actifs enregistrés dans votre base de données."}</p>
        </div>
        <div className="row-actions">
          {canManage && (
            <button className="secondary-button" type="button" onClick={toggleArchived}>
              <Archive size={16} /> {showArchived ? "Voir l’inventaire" : "Voir les archives"}
            </button>
          )}
          <button className="secondary-button" type="button" onClick={onRefresh}><Activity size={16} /> Actualiser</button>
        </div>
      </div>
      <div className="table-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un produit, une référence..." aria-label="Rechercher des produits" />
        </div>
        <div className="table-count">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>PRODUIT</th><th>RÉFÉRENCE</th><th>CATÉGORIE</th><th>QUANTITÉ</th><th>PRIX UNITAIRE</th><th>STATUT</th>{(canWrite || canManage) && <th>ACTIONS</th>}</tr>
          </thead>
          <tbody>
            {busy ? (
              <tr><td colSpan={7} className="empty-state">Chargement des produits…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="empty-state">
                <div className="empty-icon"><Package size={22} /></div>
                <strong>{query ? "Aucun résultat" : showArchived ? "Aucun produit archivé" : "Votre inventaire est vide"}</strong>
                <span>{query ? "Essayez une autre recherche." : showArchived ? "Les produits archivés apparaîtront ici." : "Ajoutez votre premier produit pour commencer à suivre votre stock."}</span>
                {!query && !showArchived && canWrite && <button type="button" className="text-button" onClick={onCreate}>Ajouter un produit <ArrowDownToLine size={14} /></button>}
              </td></tr>
            ) : filtered.map((p) => {
              const low = Number(p.quantity) <= Number(p.minQuantity);
              return (
                <tr key={p.id} className={showArchived ? "archived" : ""}>
                  <td><div className="product-cell"><div className="product-thumb"><Package size={17} /></div><strong>{p.name}</strong></div></td>
                  <td><span className="sku">{p.sku}</span></td>
                  <td><span className="category-pill">{p.category}</span></td>
                  <td><strong>{Number(p.quantity).toLocaleString("fr-FR")}</strong><span className="unit-label"> unités</span></td>
                  <td>{money(Number(p.unitPrice))}</td>
                  <td>
                    {showArchived
                      ? <span className="status-pill status-low"><i />Archivé</span>
                      : <span className={`status-pill ${low ? "status-low" : "status-ok"}`}><i />{low ? "Stock bas" : "Disponible"}</span>}
                  </td>
                  {(canWrite || canManage) && (
                    <td>
                      <div className="row-actions">
                        {showArchived ? (
                          <button type="button" className="mini-btn" onClick={() => void setArchivedFlag(p, false)}><RotateCcw size={13} /> Restaurer</button>
                        ) : (
                          <>
                            {canWrite && <button type="button" className="mini-btn" onClick={() => onMove(p)}><ArrowLeftRight size={13} /> Mouvement</button>}
                            {canManage && <button type="button" className="mini-btn" onClick={() => onEdit(p)}><Pencil size={13} /> Modifier</button>}
                            {canManage && <button type="button" className="mini-btn danger" onClick={() => void setArchivedFlag(p, true)}><Archive size={13} /> Archiver</button>}
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canWrite && !showArchived && (
        <div className="table-footer">
          <span>{products.length} produit{products.length > 1 ? "s" : ""} actif{products.length > 1 ? "s" : ""}</span>
          <button type="button" className="text-button inline" onClick={onCreate}><Plus size={13} /> Nouveau produit</button>
        </div>
      )}
    </section>
  );
}
