"use client";

import { useMemo, useState } from "react";
import { Plus, Printer, Trash2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { PAYMENT_LABELS, dateTime, money } from "@/lib/format";
import { can, type Role } from "@/lib/roles";
import { Alert, Empty, Field, Loading, Modal, PageHeader } from "@/components/ui";

type Sale = { id: string; status: string; total: string; paymentMethod: string; createdAt: string; customerName: string | null; userName: string | null; itemCount: number };
type Product = { id: string; name: string; sku: string; quantity: number; unitPrice: string };
type Customer = { id: string; name: string };
type Line = { key: number; productId: string; quantity: string };
type Receipt = { sale: Sale; items: { name: string; sku: string; quantity: number; unitPrice: string }[] };

const STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: "Terminée", cls: "badge-ok" },
  cancelled: { label: "Annulée", cls: "badge-danger" },
  draft: { label: "Brouillon", cls: "badge-muted" }
};

export default function SalesView({ role }: { role: Role }) {
  const sales = useApi<{ sales: Sale[] }>("/api/sales");
  const products = useApi<{ products: Product[] }>("/api/products");
  const customers = useApi<{ customers: Customer[] }>("/api/customers");
  const company = useApi<{ settings: { companyName: string; address: string; phone: string; footer: string } }>("/api/settings");
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", quantity: "1" }]);
  const [customerId, setCustomerId] = useState("");
  const [payment, setPayment] = useState("cash");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const canWrite = can(role, "sales.write");
  const canCancel = can(role, "sales.cancel");
  const productList = products.data?.products ?? [];

  const total = useMemo(
    () => lines.reduce((sum, line) => {
      const product = productList.find((p) => p.id === line.productId);
      return sum + (product ? Number(product.unitPrice) * (Number(line.quantity) || 0) : 0);
    }, 0),
    [lines, productList]
  );

  function startSale() {
    setLines([{ key: Date.now(), productId: "", quantity: "1" }]);
    setCustomerId("");
    setPayment("cash");
    setFormError("");
    setOpen(true);
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const result = await api<{ sale: { id: string } }>("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          customerId: customerId || undefined,
          paymentMethod: payment,
          items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity }))
        })
      });
      setOpen(false);
      setNotice(`Vente n° ${result.sale.id} enregistrée.`);
      await Promise.all([sales.reload(), products.reload()]);
      await showReceipt(result.sale.id);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function showReceipt(id: string) {
    try {
      setReceipt(await api<Receipt>(`/api/sales/${id}`));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Reçu indisponible.");
    }
  }

  async function cancelSale(sale: Sale) {
    if (!window.confirm(`Annuler la vente n° ${sale.id} ? Le stock sera remis.`)) return;
    try {
      await api(`/api/sales/${sale.id}/cancel`, { method: "POST" });
      setNotice(`Vente n° ${sale.id} annulée, stock remis.`);
      await Promise.all([sales.reload(), products.reload()]);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Annulation impossible.");
    }
  }

  const list = sales.data?.sales ?? [];

  return (
    <>
      <PageHeader title="Ventes" subtitle="Enregistrez vos ventes, le stock se met à jour automatiquement.">
        {canWrite && <button type="button" className="btn btn-primary" onClick={startSale}><Plus size={18} /> Nouvelle vente</button>}
      </PageHeader>
      {notice && <Alert kind="success">{notice}</Alert>}
      {sales.error && <Alert>{sales.error}</Alert>}

      {sales.loading && !sales.data ? <Loading /> : list.length === 0 ? (
        <Empty>Aucune vente enregistrée.</Empty>
      ) : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>N°</th><th>Date</th><th>Client</th><th className="num">Articles</th><th>Paiement</th><th className="num">Total</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td data-label="N°"><strong>#{s.id}</strong></td>
                  <td data-label="Date">{dateTime(s.createdAt)}</td>
                  <td data-label="Client">{s.customerName ?? "Client comptoir"}</td>
                  <td data-label="Articles" className="num">{s.itemCount}</td>
                  <td data-label="Paiement">{PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod}</td>
                  <td data-label="Total" className="num"><strong>{money(s.total)}</strong></td>
                  <td data-label="Statut"><span className={`badge ${STATUS[s.status]?.cls ?? "badge-muted"}`}>{STATUS[s.status]?.label ?? s.status}</span></td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm" onClick={() => showReceipt(s.id)}>Reçu</button>
                    {canCancel && s.status === "completed" && <button type="button" className="btn btn-sm btn-danger" onClick={() => cancelSale(s)}>Annuler</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}

      {open && (
        <Modal title="Nouvelle vente" onClose={() => setOpen(false)}>
          <form onSubmit={submit}>
            {formError && <Alert>{formError}</Alert>}
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <Field label="Client (facultatif)">
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Client comptoir</option>
                  {(customers.data?.customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Paiement">
                <select value={payment} onChange={(e) => setPayment(e.target.value)}>
                  {Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </div>
            <p className="hint" style={{ marginBottom: 8 }}>Articles</p>
            {lines.map((line) => (
              <div className="sale-line" key={line.key}>
                <select required value={line.productId} onChange={(e) => updateLine(line.key, { productId: e.target.value })} aria-label="Produit">
                  <option value="" disabled>Choisir un produit…</option>
                  {productList.map((p) => <option key={p.id} value={p.id} disabled={p.quantity <= 0}>{p.name} — {money(p.unitPrice)} ({p.quantity} dispo)</option>)}
                </select>
                <input type="number" min={1} step="1" inputMode="numeric" required value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} aria-label="Quantité" />
                <button type="button" className="icon-btn" onClick={() => setLines((c) => (c.length > 1 ? c.filter((l) => l.key !== line.key) : c))} aria-label="Retirer la ligne"><Trash2 size={18} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-sm" onClick={() => setLines((c) => [...c, { key: Date.now(), productId: "", quantity: "1" }])}><Plus size={16} /> Ajouter un article</button>
            <div className="total-bar"><span>Total</span><strong>{money(total)}</strong></div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Enregistrement…" : "Valider la vente"}</button>
            </div>
          </form>
        </Modal>
      )}

      {receipt && (
        <Modal title={`Reçu n° ${receipt.sale.id}`} onClose={() => setReceipt(null)}>
          <div className="print-area receipt">
            <h3>{company.data?.settings.companyName ?? "Gestion de Stock"}</h3>
            {(company.data?.settings.address || company.data?.settings.phone) && (
              <p className="muted">{[company.data?.settings.address, company.data?.settings.phone].filter(Boolean).join(" · ")}</p>
            )}
            <p className="muted">{dateTime(receipt.sale.createdAt)} · {receipt.sale.customerName ?? "Client comptoir"}</p>
            {receipt.items.map((item, index) => (
              <div className="receipt-line" key={index}>
                <span>{item.quantity} × {item.name}</span>
                <span>{money(item.quantity * Number(item.unitPrice))}</span>
              </div>
            ))}
            <div className="receipt-total"><span>Total</span><span>{money(receipt.sale.total)}</span></div>
            <p className="muted" style={{ marginTop: 10 }}>Paiement : {PAYMENT_LABELS[receipt.sale.paymentMethod] ?? receipt.sale.paymentMethod}{receipt.sale.status === "cancelled" ? " · VENTE ANNULÉE" : ""}</p>
            {company.data?.settings.footer && <p className="muted" style={{ marginTop: 6 }}>{company.data.settings.footer}</p>}
          </div>
          <div className="form-actions no-print">
            <button type="button" className="btn" onClick={() => setReceipt(null)}>Fermer</button>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}><Printer size={18} /> Imprimer</button>
          </div>
        </Modal>
      )}
    </>
  );
}
