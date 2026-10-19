"use client";

import { useState } from "react";
import { Save, X } from "lucide-react";
import { MOVEMENT_LABELS, api, type MovementType, type Product } from "@/components/types";

type Props = {
  products: Product[];
  presetProductId?: string;
  presetType?: MovementType;
  canAdjust: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export default function MovementModal({ products, presetProductId, presetType, canAdjust, onClose, onSaved }: Props) {
  const [productId, setProductId] = useState(presetProductId ?? "");
  const [type, setType] = useState<MovementType>(presetType ?? "in");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const product = products.find((p) => String(p.id) === productId);
  const current = product ? Number(product.quantity) : null;
  const amount = quantity === "" ? null : Number(quantity);
  let after: number | null = null;
  if (current !== null && amount !== null && Number.isFinite(amount)) {
    after = type === "in" ? current + amount : type === "out" ? current - amount : amount;
  }
  const types: MovementType[] = canAdjust ? ["in", "out", "adjustment"] : ["in", "out"];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/movements", {
        method: "POST",
        body: { productId: Number(productId), type, quantity: Number(quantity), note: note || undefined }
      });
      onSaved(`${MOVEMENT_LABELS[type]} enregistrée.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="movement-modal-title">
        <div className="modal-heading">
          <div>
            <div className="eyebrow">MOUVEMENT DE STOCK</div>
            <h2 id="movement-modal-title">Nouveau mouvement</h2>
            <p>Chaque mouvement est enregistré avec son auteur et l’état du stock avant / après.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <label>Produit
            <select required value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="" disabled>Choisir un produit…</option>
              {products.map((p) => <option key={p.id} value={String(p.id)}>{p.name} ({p.sku})</option>)}
            </select>
          </label>
          <div className="segmented" role="group" aria-label="Type de mouvement">
            {types.map((value) => (
              <button key={value} type="button" className={`seg seg-${value} ${type === value ? "active" : ""}`} onClick={() => setType(value)}>
                {value === "adjustment" ? "Ajustement (inventaire)" : MOVEMENT_LABELS[value]}
              </button>
            ))}
          </div>
          <label>{type === "adjustment" ? "Nouvelle quantité comptée" : "Quantité"}
            <input required type="number" step="1" min={type === "adjustment" ? 0 : 1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label>Note (facultatif)
            <input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. Livraison fournisseur, casse, inventaire de fin de mois…" />
          </label>
          {current !== null && (
            <div className="stock-preview">
              Stock actuel : <strong>{current.toLocaleString("fr-FR")}</strong>
              {after !== null && <> → après le mouvement : <strong className={after < 0 ? "neg" : ""}>{after.toLocaleString("fr-FR")}</strong></>}
            </div>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary-button" disabled={saving || (after !== null && after < 0)}>
              {saving ? "Enregistrement…" : <><Save size={16} /> Enregistrer</>}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
