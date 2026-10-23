"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { dateTime } from "@/lib/format";
import { can, type Role } from "@/lib/roles";
import { Alert, Empty, Field, Loading, Modal, PageHeader } from "@/components/ui";

type Status = "open" | "submitted" | "approved" | "cancelled";
type Count = {
  id: string; number: string; status: Status; createdAt: string; approvedAt: string | null;
  warehouse: string; createdBy: string | null; counted: number; total: number; variances: number;
};
type Warehouse = { id: string; name: string; code: string; status: "active" | "inactive" };
type Line = { productId: number; sku: string; name: string; expected: number; counted: number | null };

const STATUS: Record<Status, { label: string; badge: string }> = {
  open: { label: "En cours", badge: "badge-muted" },
  submitted: { label: "À approuver", badge: "badge-warn" },
  approved: { label: "Approuvé", badge: "badge-ok" },
  cancelled: { label: "Annulé", badge: "badge-danger" }
};

function NewCount({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, number: string) => void }) {
  const { data } = useApi<{ warehouses: Warehouse[] }>("/api/warehouses");
  const warehouses = (data?.warehouses ?? []).filter((w) => w.status === "active");
  const [warehouseId, setWarehouseId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const result = await api<{ id: string; number: string }>("/api/inventory-counts", { method: "POST", body: JSON.stringify({ warehouseId }) });
      onCreated(result.id, result.number);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nouvel inventaire" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <p className="hint" style={{ marginBottom: 10 }}>Le stock attendu de chaque produit est figé à l’ouverture. Vous saisissez ensuite ce que vous comptez réellement.</p>
        <div className="form-grid">
          <Field label="Entrepôt à inventorier" span>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">Choisir…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
            </select>
          </Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Ouverture…" : "Ouvrir l’inventaire"}</button>
        </div>
      </form>
    </Modal>
  );
}

function CountModal({ count, role, onClose, onChanged }: { count: Count; role: Role; onClose: () => void; onChanged: (message: string) => void }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = count.status === "open" && can(role, "inventory.count");

  useEffect(() => {
    api<{ lines: Line[] }>(`/api/inventory-counts/${count.id}`)
      .then((data) => {
        setLines(data.lines);
        setValues(Object.fromEntries(data.lines.map((l) => [l.productId, l.counted === null ? "" : String(l.counted)])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Chargement impossible."));
  }, [count.id]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (lines ?? []).filter((l) => !q || l.name.toLowerCase().includes(q) || l.sku.toLowerCase().includes(q));
  }, [lines, query]);

  const summary = useMemo(() => {
    let counted = 0;
    let variances = 0;
    for (const l of lines ?? []) {
      const raw = values[l.productId] ?? "";
      if (raw === "") continue;
      counted += 1;
      if (Number(raw) !== l.expected) variances += 1;
    }
    return { counted, variances };
  }, [lines, values]);

  async function save() {
    const payload = (lines ?? []).map((l) => {
      const raw = values[l.productId] ?? "";
      return { productId: l.productId, counted: raw === "" ? null : Number(raw) };
    });
    await api(`/api/inventory-counts/${count.id}`, { method: "PATCH", body: JSON.stringify({ lines: payload }) });
  }

  async function run(task: () => Promise<string>) {
    setBusy(true);
    setError("");
    try {
      onChanged(await task());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function saveOnly() {
    setBusy(true);
    setError("");
    try {
      await save();
      onChanged("Comptage enregistré.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Inventaire ${count.number}`} onClose={onClose}>
      {error && <Alert>{error}</Alert>}
      <p className="hint" style={{ marginBottom: 10 }}>
        {count.warehouse} · <span className={`badge ${STATUS[count.status].badge}`}>{STATUS[count.status].label}</span>
        {" "}· {summary.counted}/{lines?.length ?? count.total} comptés · {summary.variances} écart{summary.variances > 1 ? "s" : ""}
      </p>
      <div className="toolbar"><div className="search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un produit…" /></div></div>
      {!lines && !error ? <Loading /> : visible.length === 0 ? <Empty>Aucun produit.</Empty> : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>Produit</th><th className="num">Attendu</th><th className="num">Compté</th><th className="num">Écart</th></tr></thead>
            <tbody>
              {visible.map((l) => {
                const raw = values[l.productId] ?? "";
                const diff = raw === "" ? null : Number(raw) - l.expected;
                return (
                  <tr key={l.productId}>
                    <td data-label="Produit"><strong>{l.name}</strong> <small>{l.sku}</small></td>
                    <td data-label="Attendu" className="num">{l.expected}</td>
                    <td data-label="Compté" className="num">
                      {editable ? (
                        <input type="number" min={0} step={1} inputMode="numeric" value={raw} style={{ maxWidth: 110 }} aria-label={`Quantité comptée : ${l.name}`}
                          onChange={(e) => setValues((c) => ({ ...c, [l.productId]: e.target.value }))} />
                      ) : (raw === "" ? "—" : raw)}
                    </td>
                    <td data-label="Écart" className="num">
                      {diff === null ? "—" : diff === 0 ? "0" : <span className={`badge ${diff > 0 ? "badge-ok" : "badge-danger"}`}>{diff > 0 ? `+${diff}` : diff}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div></div>
      )}
      {count.status === "submitted" && <p className="hint" style={{ marginTop: 10 }}>Les produits non comptés ne sont pas modifiés. L’approbation applique les écarts au stock de l’entrepôt.</p>}
      <div className="form-actions">
        {(count.status === "open" || count.status === "submitted") && can(role, "inventory.count") && (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => window.confirm("Annuler cet inventaire ? Le stock ne sera pas modifié.") && run(async () => { await api(`/api/inventory-counts/${count.id}/cancel`, { method: "POST" }); return "Inventaire annulé."; })}>Annuler l’inventaire</button>
        )}
        {editable && <button type="button" className="btn" disabled={busy || !lines} onClick={saveOnly}>Enregistrer</button>}
        {editable && (
          <button type="button" className="btn btn-primary" disabled={busy || !lines || summary.counted === 0}
            onClick={() => window.confirm("Soumettre le comptage pour approbation ? Il ne sera plus modifiable.") && run(async () => { await save(); await api(`/api/inventory-counts/${count.id}/submit`, { method: "POST" }); return "Comptage soumis pour approbation."; })}>Soumettre</button>
        )}
        {count.status === "submitted" && can(role, "inventory.approve") && (
          <button type="button" className="btn btn-primary" disabled={busy}
            onClick={() => window.confirm(`Approuver ? ${summary.variances} écart(s) seront appliqués au stock.`) && run(async () => { const r = await api<{ adjusted: number }>(`/api/inventory-counts/${count.id}/approve`, { method: "POST" }); return `Inventaire approuvé : ${r.adjusted} ajustement(s) appliqué(s).`; })}>Approuver et ajuster le stock</button>
        )}
        <button type="button" className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

export default function InventoryView({ role }: { role: Role }) {
  const { data, error, loading, reload } = useApi<{ counts: Count[] }>("/api/inventory-counts");
  const [creating, setCreating] = useState(false);
  const [opened, setOpened] = useState<Count | null>(null);
  const [notice, setNotice] = useState("");
  const list = data?.counts ?? [];

  return (
    <>
      <PageHeader title="Inventaires" subtitle="Comptez le stock réel, contrôlez les écarts puis faites approuver l’ajustement.">
        {can(role, "inventory.count") && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} /> Nouvel inventaire</button>}
      </PageHeader>
      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      {loading && !data ? <Loading /> : list.length === 0 ? (
        <Empty>Aucun inventaire pour l’instant.</Empty>
      ) : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>Numéro</th><th>Entrepôt</th><th>Statut</th><th className="num">Comptés</th><th className="num">Écarts</th><th>Date</th><th /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td data-label="Numéro"><strong>{c.number}</strong></td>
                  <td data-label="Entrepôt">{c.warehouse}</td>
                  <td data-label="Statut"><span className={`badge ${STATUS[c.status].badge}`}>{STATUS[c.status].label}</span></td>
                  <td data-label="Comptés" className="num">{c.counted}/{c.total}</td>
                  <td data-label="Écarts" className="num">{c.variances}</td>
                  <td data-label="Date">{dateTime(c.createdAt)}</td>
                  <td className="actions"><button type="button" className="btn btn-sm" onClick={() => setOpened(c)}>Ouvrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}

      {creating && (
        <NewCount
          onClose={() => setCreating(false)}
          onCreated={async (_id, number) => {
            setCreating(false);
            setNotice(`Inventaire ${number} ouvert.`);
            await reload();
          }}
        />
      )}
      {opened && <CountModal count={opened} role={role} onClose={() => setOpened(null)} onChanged={(message) => { setOpened(null); setNotice(message); void reload(); }} />}
    </>
  );
}
