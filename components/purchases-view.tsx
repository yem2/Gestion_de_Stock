"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { dateTime, money } from "@/lib/format";
import { can, type Role } from "@/lib/roles";
import { Alert, Empty, Field, Loading, Modal, PageHeader } from "@/components/ui";

type Purchase = { id: string; status: string; total: string; note: string | null; createdAt: string; receivedAt: string | null; supplierName: string | null; userName: string | null; itemCount: number };
type Product = { id: string; name: string; sku: string; quantity: number; unitPrice: string };
type Supplier = { id: string; name: string };
type Line = { key: number; productId: string; quantity: string; unitCost: string };
type Detail = { purchase: Purchase; items: { name: string; sku: string; quantity: number; unitCost: string }[] };

const STATUS: Record<string, { label: string; cls: string }> = {
  ordered: { label: "Commandée", cls: "badge-warn" },
  received: { label: "Reçue", cls: "badge-ok" },
  cancelled: { label: "Annulée", cls: "badge-danger" }
};

export default function PurchasesView({ role }: { role: Role }) {
  const purchases = useApi<{ purchases: Purchase[] }>("/api/purchases");
  const products = useApi<{ products: Product[] }>("/api/products");
  const suppliers = useApi<{ suppliers: Supplier[] }>("/api/suppliers");
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", quantity: "1", unitCost: "0" }]);
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const canWrite = can(role, "purchases.write");
  const canReceive = can(role, "purchases.receive");
  const productList = products.data?.products ?? [];

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0),
    [lines]
  );

  function startOrder() {
    setLines([{ key: Date.now(), productId: "", quantity: "1", unitCost: "0" }]);
    setSupplierId("");
    setNote("");
    setFormError("");
    setOpen(true);
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function pickProduct(key: number, productId: string) {
    updateLine(key, { productId });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const result = await api<{ purchase: { id: string } }>("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplierId || undefined,
          note,
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost }))
        })
      });
      setOpen(false);
      setNotice(`Commande n° ${result.purchase.id} enregistrée.`);
      await purchases.reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function showDetail(id: string) {
    try {
      setDetail(await api<Detail>(`/api/purchases/${id}`));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Détail indisponible.");
    }
  }

  async function act(purchase: Purchase, action: "receive" | "cancel") {
    const message = action === "receive"
      ? `Confirmer la réception de la commande n° ${purchase.id} ? Le stock sera augmenté.`
      : `Annuler la commande n° ${purchase.id} ?`;
    if (!window.confirm(message)) return;
    try {
      await api(`/api/purchases/${purchase.id}/${action}`, { method: "POST" });
      setNotice(action === "receive" ? `Commande n° ${purchase.id} reçue, stock mis à jour.` : `Commande n° ${purchase.id} annulée.`);
      await Promise.all([purchases.reload(), products.reload()]);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Action impossible.");
    }
  }

  const list = purchases.data?.purchases ?? [];

  return (
    <>
      <PageHeader title="Achats" subtitle="Commandes aux fournisseurs ; la réception augmente le stock.">
        {canWrite && <button type="button" className="btn btn-primary" onClick={startOrder}><Plus size={18} /> Nouvelle commande</button>}
      </PageHeader>
      {notice && <Alert kind="success">{notice}</Alert>}
      {purchases.error && <Alert>{purchases.error}</Alert>}

      {purchases.loading && !purchases.data ? <Loading /> : list.length === 0 ? (
        <Empty>Aucune commande fournisseur.</Empty>
      ) : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>N°</th><th>Date</th><th>Fournisseur</th><th className="num">Articles</th><th className="num">Coût total</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td data-label="N°"><strong>#{p.id}</strong></td>
                  <td data-label="Date">{dateTime(p.createdAt)}</td>
                  <td data-label="Fournisseur">{p.supplierName ?? "—"}</td>
                  <td data-label="Articles" className="num">{p.itemCount}</td>
                  <td data-label="Coût total" className="num"><strong>{money(p.total)}</strong></td>
                  <td data-label="Statut"><span className={`badge ${STATUS[p.status]?.cls ?? "badge-muted"}`}>{STATUS[p.status]?.label ?? p.status}</span></td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm" onClick={() => showDetail(p.id)}>Détail</button>
                    {canReceive && p.status === "ordered" && <button type="button" className="btn btn-sm btn-primary" onClick={() => act(p, "receive")}>Réceptionner</button>}
                    {canWrite && p.status === "ordered" && <button type="button" className="btn btn-sm btn-danger" onClick={() => act(p, "cancel")}>Annuler</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}

      {open && (
        <Modal title="Nouvelle commande fournisseur" onClose={() => setOpen(false)}>
          <form onSubmit={submit}>
            {formError && <Alert>{formError}</Alert>}
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <Field label="Fournisseur (facultatif)">
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Aucun</option>
                  {(suppliers.data?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Note (facultatif)"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
            </div>
            <p className="hint" style={{ marginBottom: 8 }}>Articles : produit, quantité, coût unitaire d’achat (FCFA)</p>
            {lines.map((line) => (
              <div className="purchase-line" key={line.key}>
                <select required value={line.productId} onChange={(e) => pickProduct(line.key, e.target.value)} aria-label="Produit">
                  <option value="" disabled>Choisir un produit…</option>
                  {productList.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku}) — stock {p.quantity}</option>)}
                </select>
                <input type="number" min={1} step="1" inputMode="numeric" required value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} aria-label="Quantité" />
                <input type="number" min={0} step="1" inputMode="numeric" required value={line.unitCost} onChange={(e) => updateLine(line.key, { unitCost: e.target.value })} aria-label="Coût unitaire" />
                <button type="button" className="icon-btn" onClick={() => setLines((c) => (c.length > 1 ? c.filter((l) => l.key !== line.key) : c))} aria-label="Retirer la ligne"><Trash2 size={18} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-sm" onClick={() => setLines((c) => [...c, { key: Date.now(), productId: "", quantity: "1", unitCost: "0" }])}><Plus size={16} /> Ajouter un article</button>
            <div className="total-bar"><span>Coût total</span><strong>{money(total)}</strong></div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer la commande"}</button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title={`Commande n° ${detail.purchase.id}`} onClose={() => setDetail(null)}>
          <p className="muted" style={{ marginBottom: 12 }}>
            {dateTime(detail.purchase.createdAt)} · {detail.purchase.supplierName ?? "Sans fournisseur"} · {STATUS[detail.purchase.status]?.label ?? detail.purchase.status}
            {detail.purchase.receivedAt ? ` le ${dateTime(detail.purchase.receivedAt)}` : ""}
          </p>
          {detail.items.map((item, index) => (
            <div className="receipt-line" key={index}>
              <span>{item.quantity} × {item.name}</span>
              <span>{money(item.quantity * Number(item.unitCost))}</span>
            </div>
          ))}
          <div className="receipt-total"><span>Total</span><span>{money(detail.purchase.total)}</span></div>
          {detail.purchase.note && <p className="muted" style={{ marginTop: 10 }}>Note : {detail.purchase.note}</p>}
          <div className="form-actions"><button type="button" className="btn" onClick={() => setDetail(null)}>Fermer</button></div>
        </Modal>
      )}
    </>
  );
}
