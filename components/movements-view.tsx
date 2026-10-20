"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { MOVEMENT_LABELS, dateTime } from "@/lib/format";
import { can, type Role } from "@/lib/roles";
import { Alert, Empty, Field, Loading, Modal, PageHeader } from "@/components/ui";

type Movement = { id: string; type: string; quantity: number; note: string | null; createdAt: string; productName: string; sku: string; supplierName: string | null; userName: string | null };
type Product = { id: string; name: string; sku: string; quantity: number };
type Supplier = { id: string; name: string };

export default function MovementsView({ role }: { role: Role }) {
  const movements = useApi<{ movements: Movement[] }>("/api/movements");
  const products = useApi<{ products: Product[] }>("/api/products");
  const suppliers = useApi<{ suppliers: Supplier[] }>("/api/suppliers");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("in");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const canWrite = can(role, "movements.write");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api("/api/movements", { method: "POST", body: JSON.stringify({ ...form, type }) });
      setOpen(false);
      setNotice("Mouvement enregistré.");
      await Promise.all([movements.reload(), products.reload()]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  const list = movements.data?.movements ?? [];
  const quantityLabel = type === "adjustment" ? "Quantité comptée (nouveau stock)" : "Quantité";

  return (
    <>
      <PageHeader title="Mouvements de stock" subtitle="Entrées, sorties et inventaires, avec leur historique.">
        {canWrite && <button type="button" className="btn btn-primary" onClick={() => { setFormError(""); setType("in"); setOpen(true); }}><Plus size={18} /> Nouveau mouvement</button>}
      </PageHeader>
      {notice && <Alert kind="success">{notice}</Alert>}
      {movements.error && <Alert>{movements.error}</Alert>}

      {movements.loading && !movements.data ? <Loading /> : list.length === 0 ? (
        <Empty>Aucun mouvement enregistré.</Empty>
      ) : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Produit</th><th>Type</th><th className="num">Quantité</th><th>Détail</th><th>Par</th></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td data-label="Date">{dateTime(m.createdAt)}</td>
                  <td data-label="Produit"><strong>{m.productName}</strong><br /><span className="muted">{m.sku}</span></td>
                  <td data-label="Type"><span className={`badge ${m.type === "in" ? "badge-ok" : m.type === "out" ? "badge-warn" : "badge-muted"}`}>{MOVEMENT_LABELS[m.type]}</span></td>
                  <td data-label="Quantité" className="num">{m.quantity}</td>
                  <td data-label="Détail">{[m.supplierName, m.note].filter(Boolean).join(" · ") || "—"}</td>
                  <td data-label="Par">{m.userName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}

      {open && (
        <Modal title="Nouveau mouvement" onClose={() => setOpen(false)}>
          <form onSubmit={save}>
            {formError && <Alert>{formError}</Alert>}
            <div className="chip-row" style={{ marginBottom: 14 }}>
              {(["in", "out", "adjustment"] as const).map((t) => (
                <button key={t} type="button" className={`chip${type === t ? " active" : ""}`} onClick={() => setType(t)}>{MOVEMENT_LABELS[t]}</button>
              ))}
            </div>
            <div className="form-grid">
              <Field label="Produit" span>
                <select name="productId" required defaultValue="">
                  <option value="" disabled>Choisir un produit…</option>
                  {(products.data?.products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku}) — stock {p.quantity}</option>)}
                </select>
              </Field>
              <Field label={quantityLabel}><input name="quantity" type="number" min={type === "adjustment" ? 0 : 1} step="1" inputMode="numeric" required /></Field>
              {type === "in" && (
                <Field label="Fournisseur (facultatif)">
                  <select name="supplierId" defaultValue="">
                    <option value="">Aucun</option>
                    {(suppliers.data?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Note (facultatif)" span><input name="note" maxLength={300} /></Field>
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
