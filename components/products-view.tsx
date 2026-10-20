"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { money } from "@/lib/format";
import { can, type Role } from "@/lib/roles";
import { Alert, Empty, Field, Loading, Modal, PageHeader, StockBadge } from "@/components/ui";

type Product = { id: string; sku: string; name: string; category: string; quantity: number; unitPrice: string; minQuantity: number };

export default function ProductsView({ role }: { role: Role }) {
  const { data, error, loading, reload } = useApi<{ products: Product[] }>("/api/products");
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const canWrite = can(role, "products.write");
  const canArchive = can(role, "products.archive");

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.products ?? []).filter((p) => {
      if (lowOnly && p.quantity > p.minQuantity) return false;
      return !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    });
  }, [data, query, lowOnly]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (editing === "new") {
        await api("/api/products", { method: "POST", body: JSON.stringify(form) });
        setNotice("Produit ajouté.");
      } else if (editing) {
        const { quantity: _ignored, ...rest } = form;
        void _ignored;
        await api(`/api/products/${editing.id}`, { method: "PATCH", body: JSON.stringify(rest) });
        setNotice("Produit modifié.");
      }
      setEditing(null);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function archive(product: Product) {
    if (!window.confirm(`Archiver « ${product.name} » ? L’historique est conservé.`)) return;
    try {
      await api(`/api/products/${product.id}`, { method: "DELETE" });
      setNotice("Produit archivé.");
      await reload();
    } catch (e) {
      setNotice("");
      window.alert(e instanceof Error ? e.message : "Archivage impossible.");
    }
  }

  const current = editing && editing !== "new" ? editing : null;

  return (
    <>
      <PageHeader title="Produits" subtitle="Votre catalogue et l’état de votre stock.">
        {canWrite && <button type="button" className="btn btn-primary" onClick={() => { setFormError(""); setEditing("new"); }}><Plus size={18} /> Nouveau produit</button>}
      </PageHeader>
      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input type="search" placeholder="Rechercher un produit, une référence…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
        </div>
        <div className="chip-row">
          <button type="button" className={`chip${!lowOnly ? " active" : ""}`} onClick={() => setLowOnly(false)}>Tous</button>
          <button type="button" className={`chip${lowOnly ? " active" : ""}`} onClick={() => setLowOnly(true)}>Stock bas</button>
        </div>
      </div>

      {loading && !data ? <Loading /> : products.length === 0 ? (
        <Empty>{data?.products.length ? "Aucun produit ne correspond à votre recherche." : "Aucun produit pour l’instant. Ajoutez votre premier produit."}</Empty>
      ) : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>Produit</th><th>Référence</th><th>Catégorie</th><th className="num">Stock</th><th className="num">Prix</th><th className="num">Valeur</th><th>État</th>{(canWrite || canArchive) && <th />}</tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td data-label="Produit"><strong>{p.name}</strong></td>
                  <td data-label="Référence">{p.sku}</td>
                  <td data-label="Catégorie">{p.category}</td>
                  <td data-label="Stock" className="num">{p.quantity}</td>
                  <td data-label="Prix" className="num">{money(p.unitPrice)}</td>
                  <td data-label="Valeur" className="num">{money(p.quantity * Number(p.unitPrice))}</td>
                  <td data-label="État"><StockBadge quantity={p.quantity} min={p.minQuantity} /></td>
                  {(canWrite || canArchive) && (
                    <td className="actions">
                      {canWrite && <button type="button" className="btn btn-sm" onClick={() => { setFormError(""); setEditing(p); }}>Modifier</button>}
                      {canArchive && <button type="button" className="btn btn-sm btn-danger" onClick={() => archive(p)}>Archiver</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}

      {editing && (
        <Modal title={editing === "new" ? "Nouveau produit" : "Modifier le produit"} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            {formError && <Alert>{formError}</Alert>}
            <div className="form-grid">
              <Field label="Nom du produit" span><input name="name" required minLength={2} defaultValue={current?.name} /></Field>
              <Field label="Référence"><input name="sku" required defaultValue={current?.sku} /></Field>
              <Field label="Catégorie"><input name="category" defaultValue={current?.category ?? "Général"} /></Field>
              <Field label="Prix unitaire (FCFA)"><input name="unitPrice" type="number" min={0} step="1" inputMode="numeric" required defaultValue={current ? Number(current.unitPrice) : 0} /></Field>
              <Field label="Seuil d’alerte"><input name="minQuantity" type="number" min={0} step="1" inputMode="numeric" defaultValue={current?.minQuantity ?? 0} /></Field>
              {editing === "new" ? (
                <Field label="Stock initial" span><input name="quantity" type="number" min={0} step="1" inputMode="numeric" defaultValue={0} /></Field>
              ) : (
                <p className="hint span-2">Pour changer la quantité, utilisez la page Mouvements (entrée, sortie ou inventaire).</p>
              )}
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
