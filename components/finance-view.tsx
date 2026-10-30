"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { money } from "@/lib/format";
import { can, type Role } from "@/lib/roles";
import { Alert, Empty, Field, Loading, Modal, PageHeader } from "@/components/ui";

type Summary = {
  period: { from: string; to: string };
  revenue: number; salesCount: number; cogs: number; grossMargin: number; marginRate: number | null;
  revenueWithoutCost: number; costCoverage: number | null; expenses: number;
  expensesByCategory: { category: string; total: string }[];
  operatingResult: number; receivables: number; payables: number;
  accounts: { name: string; type: string; balance: string }[];
  topProducts: { name: string; quantity: number; revenue: string; margin: string }[];
  stock: { atCost: string; atPrice: string; unknownCost: number };
};
type Expense = {
  id: string; number: string; amount: string; description: string; expenseDate: string;
  status: "pending" | "paid" | "rejected" | "cancelled"; closedReason: string | null; category: string; method: string; createdBy: string | null;
};
type Account = { id: string; name: string; type: string; openingBalance: string; inflow: string; outflow: string; balance: string };
type Option = { id: string; name: string };

const STATUS: Record<Expense["status"], { label: string; badge: string }> = {
  pending: { label: "À approuver", badge: "badge-warn" },
  paid: { label: "Payée", badge: "badge-ok" },
  rejected: { label: "Rejetée", badge: "badge-muted" },
  cancelled: { label: "Annulée", badge: "badge-danger" }
};
const ACCOUNT_TYPES: Record<string, string> = { cash: "Espèces", mobile_money: "Mobile money", bank: "Banque" };
const PRESETS = { month: "Ce mois", week: "7 jours", days30: "30 jours", year: "Cette année" } as const;
type Preset = keyof typeof PRESETS;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function range(preset: Preset) {
  const today = new Date();
  const start = new Date(today);
  if (preset === "month") start.setDate(1);
  else if (preset === "week") start.setDate(today.getDate() - 6);
  else if (preset === "days30") start.setDate(today.getDate() - 29);
  else start.setMonth(0, 1);
  return { from: iso(start), to: iso(today) };
}
const negative = (value: number | string) => (Number(value) < 0 ? { color: "var(--danger)" } : undefined);

function ExpenseModal({ canApprove, onClose, onDone }: { canApprove: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const categories = useApi<{ categories: Option[] }>("/api/finance/categories");
  const methods = useApi<{ methods: Option[] }>("/api/payment-methods");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [approve, setApprove] = useState(canApprove);
  const [idemKey] = useState(() => crypto.randomUUID());

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await api<{ expense: { number: string; status: string } }>("/api/finance/expenses", {
        method: "POST",
        headers: { "Idempotency-Key": idemKey },
        body: JSON.stringify({ ...form, amount: Number(form.amount), approve: canApprove && approve })
      });
      onDone(result.expense.status === "paid" ? `Dépense ${result.expense.number} enregistrée et payée.` : `Dépense ${result.expense.number} enregistrée, en attente d’approbation.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nouvelle dépense" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <div className="form-grid">
          <Field label="Catégorie">
            <select name="categoryId" required defaultValue="">
              <option value="" disabled>Choisir…</option>
              {categories.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Montant (FCFA)"><input name="amount" type="number" min={1} step="1" inputMode="numeric" required /></Field>
          <Field label="Description" span><input name="description" required minLength={2} maxLength={300} placeholder="Ex. Loyer d’octobre" /></Field>
          <Field label="Date"><input name="expenseDate" type="date" defaultValue={iso(new Date())} required /></Field>
          <Field label="Payée avec">
            <select name="methodId" required defaultValue="">
              <option value="" disabled>Choisir…</option>
              {methods.data?.methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        </div>
        {canApprove && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} style={{ width: "auto" }} />
            <span>Approuver et payer tout de suite (la trésorerie diminue)</span>
          </label>
        )}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function FinanceView({ role }: { role: Role }) {
  const [tab, setTab] = useState<"summary" | "expenses" | "treasury">("summary");
  const [preset, setPreset] = useState<Preset>("month");
  const { from, to } = range(preset);
  const summary = useApi<Summary>(`/api/finance/summary?from=${from}&to=${to}`);
  const expenses = useApi<{ expenses: Expense[] }>("/api/finance/expenses");
  const accounts = useApi<{ accounts: Account[] }>("/api/finance/accounts");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const canWrite = can(role, "expenses.write");
  const canApprove = can(role, "expenses.approve");
  const s = summary.data;

  async function reloadAll() {
    await Promise.all([summary.reload(), expenses.reload(), accounts.reload()]);
  }

  async function approve(expense: Expense) {
    if (!window.confirm(`Approuver et payer la dépense ${expense.number} de ${money(expense.amount)} ?`)) return;
    setError("");
    try {
      await api(`/api/finance/expenses/${expense.id}/approve`, { method: "POST" });
      setNotice(`Dépense ${expense.number} approuvée et payée.`);
      await reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approbation impossible.");
    }
  }

  async function close(expense: Expense) {
    const reason = window.prompt(expense.status === "paid" ? `Annuler la dépense ${expense.number} (le paiement sera contrepassé). Motif :` : `Rejeter la dépense ${expense.number}. Motif :`);
    if (!reason) return;
    setError("");
    try {
      await api(`/api/finance/expenses/${expense.id}/close`, { method: "POST", body: JSON.stringify({ reason }) });
      setNotice(expense.status === "paid" ? `Dépense ${expense.number} annulée.` : `Dépense ${expense.number} rejetée.`);
      await reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    }
  }

  async function setOpening(account: Account) {
    if (!canApprove) return;
    const value = window.prompt(`Solde d’ouverture du compte « ${account.name} » (FCFA), c’est-à-dire le montant détenu au démarrage :`, String(Number(account.openingBalance)));
    if (value === null || value.trim() === "") return;
    setError("");
    try {
      await api(`/api/finance/accounts/${account.id}`, { method: "PATCH", body: JSON.stringify({ openingBalance: Number(value.replace(/\s/g, "")) }) });
      setNotice(`Solde d’ouverture de « ${account.name} » enregistré.`);
      await reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modification impossible.");
    }
  }

  return (
    <>
      <PageHeader title="Finance" subtitle="Marges, dépenses et trésorerie : le résultat réel de votre activité.">
        {canWrite && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} /> Nouvelle dépense</button>}
      </PageHeader>
      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="chip-row" style={{ marginBottom: 14 }}>
        <button type="button" className={`chip${tab === "summary" ? " active" : ""}`} onClick={() => setTab("summary")}>Synthèse</button>
        <button type="button" className={`chip${tab === "expenses" ? " active" : ""}`} onClick={() => setTab("expenses")}>Dépenses</button>
        <button type="button" className={`chip${tab === "treasury" ? " active" : ""}`} onClick={() => setTab("treasury")}>Trésorerie</button>
      </div>

      {tab === "summary" && (
        <>
          <div className="chip-row" style={{ marginBottom: 14 }}>
            {(Object.keys(PRESETS) as Preset[]).map((key) => (
              <button key={key} type="button" className={`chip${preset === key ? " active" : ""}`} onClick={() => setPreset(key)}>{PRESETS[key]}</button>
            ))}
          </div>
          {summary.error && <Alert>{summary.error}</Alert>}
          {!s ? <Loading /> : (
            <>
              {s.costCoverage !== null && s.costCoverage < 1 && (
                <Alert>Le coût d’achat est inconnu pour {Math.round((1 - s.costCoverage) * 100)} % du chiffre d’affaires ({money(s.revenueWithoutCost)}). Renseignez le coût moyen dans la fiche produit, ou réceptionnez des achats, pour fiabiliser la marge.</Alert>
              )}
              <div className="kpis">
                <div className="kpi"><span>Chiffre d’affaires</span><strong>{money(s.revenue)}</strong><small>{s.salesCount} vente(s)</small></div>
                <div className="kpi"><span>Marge brute</span><strong style={negative(s.grossMargin)}>{money(s.grossMargin)}</strong><small>{s.marginRate === null ? "Coût inconnu" : `${(s.marginRate * 100).toFixed(1).replace(".", ",")} % des ventes au coût connu`}</small></div>
                <div className="kpi"><span>Dépenses payées</span><strong>{money(s.expenses)}</strong><small>Sur la période</small></div>
                <div className="kpi accent"><span>Résultat d’exploitation</span><strong style={negative(s.operatingResult)}>{money(s.operatingResult)}</strong><small>Marge brute − dépenses</small></div>
              </div>
              <div className="kpis">
                <div className="kpi"><span>Créances clients</span><strong>{money(s.receivables)}</strong><small>À encaisser</small></div>
                <div className="kpi"><span>Dettes fournisseurs</span><strong>{money(s.payables)}</strong><small>À régler</small></div>
                <div className="kpi"><span>Stock au coût (CUMP)</span><strong>{money(Number(s.stock.atCost))}</strong><small>{s.stock.unknownCost > 0 ? `${s.stock.unknownCost} produit(s) sans coût` : `Au prix de vente : ${money(Number(s.stock.atPrice))}`}</small></div>
              </div>
              <div className="grid-2">
                <section className="card">
                  <h3>Dépenses par catégorie</h3>
                  {s.expensesByCategory.length === 0 ? <p className="hint">Aucune dépense sur la période.</p> : (
                    <div className="list">{s.expensesByCategory.map((c) => <div className="list-row" key={c.category}><span>{c.category}</span><span className="num"><strong>{money(c.total)}</strong></span></div>)}</div>
                  )}
                </section>
                <section className="card">
                  <h3>Produits les plus rentables</h3>
                  {s.topProducts.length === 0 ? <p className="hint">Aucune vente avec un coût connu sur la période.</p> : (
                    <div className="list">{s.topProducts.map((p) => <div className="list-row" key={p.name}><span>{p.name}<small>{p.quantity} vendu(s)</small></span><span className="num"><strong>{money(p.margin)}</strong></span></div>)}</div>
                  )}
                </section>
              </div>
            </>
          )}
        </>
      )}

      {tab === "expenses" && (
        expenses.loading && !expenses.data ? <Loading /> : (expenses.data?.expenses ?? []).length === 0 ? <Empty>Aucune dépense enregistrée.</Empty> : (
          <div className="table-card"><div className="table-wrap">
            <table className="table">
              <thead><tr><th>N°</th><th>Date</th><th>Catégorie</th><th>Description</th><th>Payée avec</th><th className="num">Montant</th><th>Statut</th><th /></tr></thead>
              <tbody>
                {expenses.data?.expenses.map((e) => (
                  <tr key={e.id}>
                    <td data-label="N°"><strong>{e.number}</strong></td>
                    <td data-label="Date">{new Date(e.expenseDate).toLocaleDateString("fr-FR")}</td>
                    <td data-label="Catégorie">{e.category}</td>
                    <td data-label="Description">{e.description}{e.closedReason && <small> · {e.closedReason}</small>}</td>
                    <td data-label="Payée avec">{e.method}</td>
                    <td data-label="Montant" className="num"><strong>{money(e.amount)}</strong></td>
                    <td data-label="Statut"><span className={`badge ${STATUS[e.status].badge}`}>{STATUS[e.status].label}</span></td>
                    <td className="actions">
                      {canApprove && e.status === "pending" && <button type="button" className="btn btn-sm btn-primary" onClick={() => approve(e)}>Approuver</button>}
                      {canApprove && (e.status === "pending" || e.status === "paid") && <button type="button" className="btn btn-sm btn-danger" onClick={() => close(e)}>{e.status === "paid" ? "Annuler" : "Rejeter"}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        )
      )}

      {tab === "treasury" && (
        accounts.loading && !accounts.data ? <Loading /> : (
          <>
            <div className="table-card"><div className="table-wrap">
              <table className="table">
                <thead><tr><th>Compte</th><th>Type</th><th className="num">Ouverture</th><th className="num">Encaissé</th><th className="num">Décaissé</th><th className="num">Solde</th><th /></tr></thead>
                <tbody>
                  {accounts.data?.accounts.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Compte"><strong>{a.name}</strong></td>
                      <td data-label="Type">{ACCOUNT_TYPES[a.type] ?? a.type}</td>
                      <td data-label="Ouverture" className="num">{money(a.openingBalance)}</td>
                      <td data-label="Encaissé" className="num">{money(a.inflow)}</td>
                      <td data-label="Décaissé" className="num">{money(a.outflow)}</td>
                      <td data-label="Solde" className="num"><strong style={negative(a.balance)}>{money(a.balance)}</strong></td>
                      <td className="actions">{canApprove && <button type="button" className="btn btn-sm" onClick={() => setOpening(a)}>Solde d’ouverture</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></div>
            <p className="hint" style={{ marginTop: 10 }}>Solde = ouverture + encaissements validés − règlements validés. Les paiements en attente ou contrepassés ne comptent pas. Renseignez le solde d’ouverture avec le montant réellement détenu au démarrage.</p>
          </>
        )
      )}

      {creating && <ExpenseModal canApprove={canApprove} onClose={() => setCreating(false)} onDone={(message) => { setCreating(false); setNotice(message); void reloadAll(); }} />}
    </>
  );
}
