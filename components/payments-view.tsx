"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { dateTime, money } from "@/lib/format";
import { can, type Role } from "@/lib/roles";
import { Alert, Empty, Field, Loading, Modal, PageHeader } from "@/components/ui";

type Status = "pending" | "posted" | "failed" | "reversed";
type Payment = {
  id: string; number: string; direction: "in" | "out"; status: Status; amount: string; reference: string | null;
  paidAt: string; method: string; party: string | null; createdBy: string | null; reversalReason: string | null; allocated: string;
};
type Receivable = { id: string; customerId: string | null; customer: string | null; creditLimit: string | null; total: string; paid: string; pending: string; due: string; createdAt: string };
type Payable = { id: string; orderNumber: string | null; supplierId: string | null; supplier: string | null; total: string; paid: string; pending: string; due: string; status: string; createdAt: string };
type Method = { id: string; code: string; name: string; type: string };
type Target = { kind: "sale" | "purchase_order"; id: string; label: string; party: string; partyId: string | null; due: number };

const STATUS: Record<Status, { label: string; badge: string }> = {
  pending: { label: "En attente", badge: "badge-warn" },
  posted: { label: "Validé", badge: "badge-ok" },
  failed: { label: "Échoué", badge: "badge-danger" },
  reversed: { label: "Contrepassé", badge: "badge-muted" }
};

function PayModal({ target, methods, onClose, onDone }: { target: Target; methods: Method[]; onClose: () => void; onDone: (message: string) => void }) {
  const [amount, setAmount] = useState(String(target.due));
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [idemKey] = useState(() => crypto.randomUUID());
  const inbound = target.kind === "sale";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const value = Number(amount);
      const result = await api<{ payment: { number: string } }>("/api/payments", {
        method: "POST",
        headers: { "Idempotency-Key": idemKey },
        body: JSON.stringify({
          direction: inbound ? "in" : "out",
          customerId: inbound ? target.partyId ?? undefined : undefined,
          supplierId: inbound ? undefined : target.partyId ?? undefined,
          amount: value,
          methodId,
          reference,
          note,
          allocations: [{ documentType: target.kind, documentId: Number(target.id), amount: value }]
        })
      });
      onDone(`${inbound ? "Encaissement" : "Règlement"} ${result.payment.number} enregistré.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={inbound ? "Encaisser" : "Régler"} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <p className="hint" style={{ marginBottom: 12 }}>{target.label} · {target.party} · reste dû <strong>{money(target.due)}</strong></p>
        <div className="form-grid">
          <Field label="Montant (FCFA)"><input type="number" min={1} max={target.due} step="1" inputMode="numeric" required value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Mode de paiement">
            <select value={methodId} onChange={(e) => setMethodId(e.target.value)} required>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Référence (facultatif)" span><input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} placeholder="N° de transaction, de chèque…" /></Field>
          <Field label="Note (facultatif)" span><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !methodId}>{saving ? "Enregistrement…" : inbound ? "Encaisser" : "Régler"}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function PaymentsView({ role }: { role: Role }) {
  const [tab, setTab] = useState<"payments" | "receivables" | "payables">("payments");
  const payments = useApi<{ payments: Payment[] }>("/api/payments");
  const receivables = useApi<{ receivables: Receivable[] }>("/api/finance/receivables");
  const payables = useApi<{ payables: Payable[] }>("/api/finance/payables");
  const methods = useApi<{ methods: Method[] }>("/api/payment-methods");
  const [target, setTarget] = useState<Target | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const canWrite = can(role, "payments.write");
  const canReverse = can(role, "payments.reverse");

  const totalDue = (receivables.data?.receivables ?? []).reduce((sum, r) => sum + Number(r.due), 0);
  const totalOwed = (payables.data?.payables ?? []).reduce((sum, p) => sum + Number(p.due), 0);

  async function reloadAll() {
    await Promise.all([payments.reload(), receivables.reload(), payables.reload()]);
  }

  async function reverse(payment: Payment) {
    const reason = window.prompt(`Contrepasser le paiement ${payment.number} ? Indiquez le motif :`);
    if (!reason) return;
    setError("");
    try {
      await api(`/api/payments/${payment.id}/reverse`, { method: "POST", body: JSON.stringify({ reason }) });
      setNotice(`Paiement ${payment.number} contrepassé.`);
      await reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Contrepassation impossible.");
    }
  }

  return (
    <>
      <PageHeader title="Paiements" subtitle="Encaissements, règlements, créances clients et dettes fournisseurs." />
      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="kpis">
        <div className="kpi"><span>Créances clients</span><strong>{money(totalDue)}</strong><small>{receivables.data?.receivables.length ?? 0} vente(s) à encaisser</small></div>
        <div className="kpi"><span>Dettes fournisseurs</span><strong>{money(totalOwed)}</strong><small>{payables.data?.payables.length ?? 0} commande(s) à régler</small></div>
      </div>

      <div className="chip-row" style={{ margin: "4px 0 14px" }}>
        <button type="button" className={`chip${tab === "payments" ? " active" : ""}`} onClick={() => setTab("payments")}>Paiements</button>
        <button type="button" className={`chip${tab === "receivables" ? " active" : ""}`} onClick={() => setTab("receivables")}>Créances clients</button>
        <button type="button" className={`chip${tab === "payables" ? " active" : ""}`} onClick={() => setTab("payables")}>Dettes fournisseurs</button>
      </div>

      {tab === "payments" && (
        payments.loading && !payments.data ? <Loading /> : (payments.data?.payments ?? []).length === 0 ? <Empty>Aucun paiement.</Empty> : (
          <div className="table-card"><div className="table-wrap">
            <table className="table">
              <thead><tr><th>N°</th><th>Date</th><th>Type</th><th>Tiers</th><th>Mode</th><th className="num">Montant</th><th>Statut</th><th /></tr></thead>
              <tbody>
                {payments.data?.payments.map((p) => (
                  <tr key={p.id}>
                    <td data-label="N°"><strong>{p.number}</strong></td>
                    <td data-label="Date">{dateTime(p.paidAt)}</td>
                    <td data-label="Type">{p.direction === "in" ? "Encaissement" : "Règlement"}</td>
                    <td data-label="Tiers">{p.party ?? "—"}</td>
                    <td data-label="Mode">{p.method}{p.reference ? ` · ${p.reference}` : ""}</td>
                    <td data-label="Montant" className="num"><strong>{money(p.amount)}</strong></td>
                    <td data-label="Statut"><span className={`badge ${STATUS[p.status].badge}`}>{STATUS[p.status].label}</span>{p.reversalReason && <small> {p.reversalReason}</small>}</td>
                    <td className="actions">{canReverse && p.status === "posted" && <button type="button" className="btn btn-sm btn-danger" onClick={() => reverse(p)}>Contrepasser</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        )
      )}

      {tab === "receivables" && (
        receivables.loading && !receivables.data ? <Loading /> : (receivables.data?.receivables ?? []).length === 0 ? <Empty>Aucune créance : toutes les ventes sont réglées.</Empty> : (
          <div className="table-card"><div className="table-wrap">
            <table className="table">
              <thead><tr><th>Vente</th><th>Date</th><th>Client</th><th className="num">Total</th><th className="num">Payé</th><th className="num">Reste dû</th><th /></tr></thead>
              <tbody>
                {receivables.data?.receivables.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Vente"><strong>#{r.id}</strong></td>
                    <td data-label="Date">{dateTime(r.createdAt)}</td>
                    <td data-label="Client">{r.customer ?? "Client comptoir"}</td>
                    <td data-label="Total" className="num">{money(r.total)}</td>
                    <td data-label="Payé" className="num">{money(r.paid)}</td>
                    <td data-label="Reste dû" className="num"><strong>{money(r.due)}</strong>{Number(r.pending) > 0 && <small> (dont {money(r.pending)} en attente)</small>}</td>
                    <td className="actions">{canWrite && <button type="button" className="btn btn-sm btn-primary" onClick={() => setTarget({ kind: "sale", id: r.id, label: `Vente #${r.id}`, party: r.customer ?? "Client comptoir", partyId: r.customerId, due: Number(r.due) - Number(r.pending) })}>Encaisser</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        )
      )}

      {tab === "payables" && (
        payables.loading && !payables.data ? <Loading /> : (payables.data?.payables ?? []).length === 0 ? <Empty>Aucune dette : toutes les commandes sont réglées.</Empty> : (
          <div className="table-card"><div className="table-wrap">
            <table className="table">
              <thead><tr><th>Commande</th><th>Date</th><th>Fournisseur</th><th className="num">Total</th><th className="num">Payé</th><th className="num">Reste à payer</th><th /></tr></thead>
              <tbody>
                {payables.data?.payables.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Commande"><strong>{p.orderNumber ?? `#${p.id}`}</strong></td>
                    <td data-label="Date">{dateTime(p.createdAt)}</td>
                    <td data-label="Fournisseur">{p.supplier ?? "—"}</td>
                    <td data-label="Total" className="num">{money(p.total)}</td>
                    <td data-label="Payé" className="num">{money(p.paid)}</td>
                    <td data-label="Reste à payer" className="num"><strong>{money(p.due)}</strong></td>
                    <td className="actions">{canWrite && <button type="button" className="btn btn-sm btn-primary" onClick={() => setTarget({ kind: "purchase_order", id: p.id, label: `Commande ${p.orderNumber ?? `#${p.id}`}`, party: p.supplier ?? "—", partyId: p.supplierId, due: Number(p.due) - Number(p.pending) })}>Régler</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        )
      )}

      {target && (
        <PayModal
          target={target}
          methods={methods.data?.methods ?? []}
          onClose={() => setTarget(null)}
          onDone={(message) => { setTarget(null); setNotice(message); void reloadAll(); }}
        />
      )}
    </>
  );
}
