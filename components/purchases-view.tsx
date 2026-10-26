"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { dateTime, money } from "@/lib/format";
import { can, type Role } from "@/lib/roles";
import { Alert, Empty, Field, Loading, Modal, PageHeader } from "@/components/ui";

type Purchase = { id: string; orderNumber: string | null; status: string; total: string; note: string | null; createdAt: string; receivedAt: string | null; supplierName: string | null; userName: string | null; itemCount: number };
type Product = { id: string; name: string; sku: string; quantity: number; unitPrice: string };
type Supplier = { id: string; name: string };
type Line = { key: number; productId: string; quantity: string; unitCost: string };
type DetailItem = { id: string; name: string; sku: string; quantity: number; unitCost: string; received: number; rejected: number };
type Receipt = { number: string; receivedAt: string; note: string | null; userName: string | null };
type Detail = { purchase: Purchase; items: DetailItem[]; receipts: Receipt[] };
type ReceiveValue = { received: string; rejected: string };

const ref = (p: { id: string; orderNumber: string | null }) => p.orderNumber ?? `#${p.id}`;

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "badge-muted" },
  submitted: { label: "À approuver", cls: "badge-warn" },
  ordered: { label: "Commandée", cls: "badge-warn" },
  partially_received: { label: "Reçue en partie", cls: "badge-warn" },
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
  const [requireApproval, setRequireApproval] = useState(false);
  const [receiving, setReceiving] = useState<Detail | null>(null);
  const [receiveValues, setReceiveValues] = useState<Record<string, ReceiveValue>>({});
  const [receiveNote, setReceiveNote] = useState("");
  const [receiveError, setReceiveError] = useState("");
  const [receiveBusy, setReceiveBusy] = useState(false);
  const canWrite = can(role, "purchases.write");
  const canReceive = can(role, "purchases.receive");
  const canApprove = can(role, "purchases.approve");
  const productList = products.data?.products ?? [];

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0),
    [lines]
  );

  function startOrder() {
    setLines([{ key: Date.now(), productId: "", quantity: "1", unitCost: "0" }]);
    setSupplierId("");
    setNote("");
    setRequireApproval(false);
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
      const result = await api<{ purchase: { id: string; number: string | null } }>("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplierId || undefined,
          note,
          requireApproval,
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost }))
        })
      });
      setOpen(false);
      setNotice(`Commande ${result.purchase.number ?? `n° ${result.purchase.id}`} ${requireApproval ? "enregistrée en brouillon." : "enregistrée."}`);
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

  async function act(purchase: Purchase, action: "submit" | "approve" | "cancel") {
    const label = ref(purchase);
    const confirmText = {
      submit: `Soumettre la commande ${label} pour approbation ?`,
      approve: `Approuver la commande ${label} ? Elle pourra ensuite être réceptionnée.`,
      cancel: `Annuler la commande ${label} ?`
    }[action];
    const done = {
      submit: `Commande ${label} soumise pour approbation.`,
      approve: `Commande ${label} approuvée.`,
      cancel: `Commande ${label} annulée.`
    }[action];
    if (!window.confirm(confirmText)) return;
    try {
      await api(`/api/purchases/${purchase.id}/${action}`, { method: "POST" });
      setNotice(done);
      await purchases.reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Action impossible.");
    }
  }

  async function startReceive(purchase: Purchase) {
    try {
      const data = await api<Detail>(`/api/purchases/${purchase.id}`);
      const values: Record<string, ReceiveValue> = {};
      for (const item of data.items) {
        const remaining = item.quantity - item.received - item.rejected;
        values[item.id] = { received: remaining > 0 ? String(remaining) : "0", rejected: "0" };
      }
      setReceiveValues(values);
      setReceiveNote("");
      setReceiveError("");
      setReceiving(data);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Détail indisponible.");
    }
  }

  async function submitReceive(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receiving) return;
    setReceiveError("");
    setReceiveBusy(true);
    try {
      const lines = receiving.items
        .map((item) => ({ itemId: item.id, received: Number(receiveValues[item.id]?.received) || 0, rejected: Number(receiveValues[item.id]?.rejected) || 0 }))
        .filter((l) => l.received > 0 || l.rejected > 0);
      const result = await api<{ number: string }>(`/api/purchases/${receiving.purchase.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ lines, note: receiveNote })
      });
      setReceiving(null);
      setNotice(`Réception ${result.number} enregistrée, stock mis à jour.`);
      await Promise.all([purchases.reload(), products.reload()]);
    } catch (e) {
      setReceiveError(e instanceof Error ? e.message : "Réception impossible.");
    } finally {
      setReceiveBusy(false);
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
                  <td data-label="N°"><strong>{ref(p)}</strong></td>
                  <td data-label="Date">{dateTime(p.createdAt)}</td>
                  <td data-label="Fournisseur">{p.supplierName ?? "—"}</td>
                  <td data-label="Articles" className="num">{p.itemCount}</td>
                  <td data-label="Coût total" className="num"><strong>{money(p.total)}</strong></td>
                  <td data-label="Statut"><span className={`badge ${STATUS[p.status]?.cls ?? "badge-muted"}`}>{STATUS[p.status]?.label ?? p.status}</span></td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm" onClick={() => showDetail(p.id)}>Détail</button>
                    {canWrite && p.status === "draft" && <button type="button" className="btn btn-sm btn-primary" onClick={() => act(p, "submit")}>Soumettre</button>}
                    {canApprove && p.status === "submitted" && <button type="button" className="btn btn-sm btn-primary" onClick={() => act(p, "approve")}>Approuver</button>}
                    {canReceive && (p.status === "ordered" || p.status === "partially_received") && <button type="button" className="btn btn-sm btn-primary" onClick={() => startReceive(p)}>Réceptionner</button>}
                    {canWrite && ["draft", "submitted", "ordered"].includes(p.status) && <button type="button" className="btn btn-sm btn-danger" onClick={() => act(p, "cancel")}>Annuler</button>}
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
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
              <input type="checkbox" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} style={{ width: "auto" }} />
              <span>Enregistrer en brouillon, à faire approuver avant de commander</span>
            </label>
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

      {receiving && (
        <Modal title={`Réception : ${ref(receiving.purchase)}`} onClose={() => setReceiving(null)}>
          <form onSubmit={submitReceive}>
            {receiveError && <Alert>{receiveError}</Alert>}
            <p className="hint" style={{ marginBottom: 10 }}>Indiquez ce qui est arrivé. Les quantités rejetées n’entrent pas en stock. Ce qui reste à recevoir pourra l’être plus tard.</p>
            <div className="table-card"><div className="table-wrap">
              <table className="table">
                <thead><tr><th>Produit</th><th className="num">Reste</th><th className="num">Reçu</th><th className="num">Rejeté</th></tr></thead>
                <tbody>
                  {receiving.items.map((item) => {
                    const remaining = item.quantity - item.received - item.rejected;
                    const value = receiveValues[item.id] ?? { received: "0", rejected: "0" };
                    return (
                      <tr key={item.id}>
                        <td data-label="Produit"><strong>{item.name}</strong> <small>{item.sku}</small></td>
                        <td data-label="Reste" className="num">{remaining}</td>
                        <td data-label="Reçu" className="num">
                          <input type="number" min={0} max={remaining} step={1} inputMode="numeric" disabled={remaining <= 0} value={value.received} style={{ maxWidth: 100 }} aria-label={`Quantité reçue : ${item.name}`}
                            onChange={(e) => setReceiveValues((c) => ({ ...c, [item.id]: { ...value, received: e.target.value } }))} />
                        </td>
                        <td data-label="Rejeté" className="num">
                          <input type="number" min={0} max={remaining} step={1} inputMode="numeric" disabled={remaining <= 0} value={value.rejected} style={{ maxWidth: 100 }} aria-label={`Quantité rejetée : ${item.name}`}
                            onChange={(e) => setReceiveValues((c) => ({ ...c, [item.id]: { ...value, rejected: e.target.value } }))} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div></div>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <Field label="Note (facultatif)" span><input value={receiveNote} maxLength={300} onChange={(e) => setReceiveNote(e.target.value)} /></Field>
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setReceiving(null)}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={receiveBusy}>{receiveBusy ? "Enregistrement…" : "Enregistrer la réception"}</button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title={`Commande ${ref(detail.purchase)}`} onClose={() => setDetail(null)}>
          <p className="muted" style={{ marginBottom: 12 }}>
            {dateTime(detail.purchase.createdAt)} · {detail.purchase.supplierName ?? "Sans fournisseur"} · {STATUS[detail.purchase.status]?.label ?? detail.purchase.status}
            {detail.purchase.receivedAt ? ` le ${dateTime(detail.purchase.receivedAt)}` : ""}
          </p>
          {detail.items.map((item, index) => (
            <div className="receipt-line" key={index}>
              <span>{item.quantity} × {item.name}{(item.received > 0 || item.rejected > 0) && <small> · reçu {item.received}{item.rejected > 0 ? `, rejeté ${item.rejected}` : ""}</small>}</span>
              <span>{money(item.quantity * Number(item.unitCost))}</span>
            </div>
          ))}
          <div className="receipt-total"><span>Total</span><span>{money(detail.purchase.total)}</span></div>
          {detail.purchase.note && <p className="muted" style={{ marginTop: 10 }}>Note : {detail.purchase.note}</p>}
          {detail.receipts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="hint" style={{ marginBottom: 6 }}>Bons de réception</p>
              {detail.receipts.map((r) => (
                <div className="receipt-line" key={r.number}>
                  <span><strong>{r.number}</strong>{r.note ? ` · ${r.note}` : ""}</span>
                  <span>{dateTime(r.receivedAt)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="form-actions"><button type="button" className="btn" onClick={() => setDetail(null)}>Fermer</button></div>
        </Modal>
      )}
    </>
  );
}
