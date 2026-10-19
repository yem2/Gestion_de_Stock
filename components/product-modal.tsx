"use client";

import { useState } from "react";
import { Plus, Save, X } from "lucide-react";
import { api, type Product } from "@/components/types";

type Props = {
  /** null = création, sinon modification de ce produit. */
  product: Product | null;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export default function ProductModal({ product, onClose, onSaved }: Props) {
  const editing = product !== null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    category: product?.category ?? "Général",
    quantity: "0",
    unitPrice: String(product?.unitPrice ?? "0"),
    minQuantity: String(product?.minQuantity ?? "0")
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api(`/api/products/${product.id}`, {
          method: "PATCH",
          body: {
            sku: form.sku, name: form.name, category: form.category,
            unitPrice: Number(form.unitPrice), minQuantity: Number(form.minQuantity)
          }
        });
        onSaved("Produit modifié.");
      } else {
        await api("/api/products", {
          method: "POST",
          body: {
            ...form,
            quantity: Number(form.quantity),
            unitPrice: Number(form.unitPrice),
            minQuantity: Number(form.minQuantity)
          }
        });
        onSaved("Produit ajouté avec succès.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <div className="modal-heading">
          <div>
            <div className="eyebrow">INVENTAIRE</div>
            <h2 id="product-modal-title">{editing ? "Modifier le produit" : "Ajouter un produit"}</h2>
            <p>{editing ? "La quantité se modifie par un mouvement de stock." : "Renseignez les informations de votre article."}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <label>Nom du produit
            <input required minLength={2} maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex. Routeur Wi-Fi" />
          </label>
          <div className="form-grid">
            <label>Référence / SKU
              <input required maxLength={80} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Ex. ROU-001" />
            </label>
            <label>Catégorie
              <input maxLength={100} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex. Réseau" />
            </label>
            {!editing && (
              <label>Quantité initiale
                <input required type="number" min="0" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </label>
            )}
            <label>Prix unitaire (FCFA)
              <input required type="number" min="0" step="1" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
            </label>
            <label className="full-width">Seuil d’alerte de stock
              <input required type="number" min="0" step="1" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} />
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Enregistrement…" : editing ? <><Save size={16} /> Enregistrer</> : <><Plus size={17} /> Enregistrer le produit</>}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
