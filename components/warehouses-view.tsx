"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { can, type Role } from "@/lib/roles";
import { Alert, Empty, Field, Loading, Modal, PageHeader } from "@/components/ui";

type Warehouse = { id: string; name: string; code: string; status: "active" | "inactive"; isDefault: boolean; products: number; units: number };
type StockLine = { id: number; sku: string; name: string; onHand: number; available: number };

function StockModal({ warehouse, onClose }: { warehouse: Warehouse; onClose: () => void }) {
  const [lines, setLines] = useState<StockLine[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ stock: StockLine[] }>(`/api/warehouses/${warehouse.id}/stock`)
      .then((data) => setLines(data.stock))
      .catch((e) => setError(e instanceof Error ? e.message : "Chargement impossible."));
  }, [warehouse.id]);

  return (
    <Modal title={`Stock : ${warehouse.name}`} onClose={onClose}>
      {error && <Alert>{error}</Alert>}
      {!lines && !error ? <Loading /> : lines && lines.length === 0 ? (
        <Empty>Aucun produit en stock dans cet entrepôt.</Empty>
      ) : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>Produit</th><th>Référence</th><th className="num">En stock</th><th className="num">Disponible</th></tr></thead>
            <tbody>
              {lines?.map((l) => (
                <tr key={l.id}>
                  <td data-label="Produit"><strong>{l.name}</strong></td>
                  <td data-label="Référence">{l.sku}</td>
                  <td data-label="En stock" className="num">{l.onHand}</td>
                  <td data-label="Disponible" className="num">{l.available}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </Modal>
  );
}

export default function WarehousesView({ role }: { role: Role }) {
  const { data, error, loading, reload } = useApi<{ warehouses: Warehouse[] }>("/api/warehouses");
  const [editing, setEditing] = useState<Warehouse | "new" | null>(null);
  const [viewing, setViewing] = useState<Warehouse | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const canWrite = can(role, "warehouses.write");
  const list = data?.warehouses ?? [];
  const current = editing && editing !== "new" ? editing : null;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (current) await api(`/api/warehouses/${current.id}`, { method: "PATCH", body: JSON.stringify(form) });
      else await api("/api/warehouses", { method: "POST", body: JSON.stringify(form) });
      setEditing(null);
      setNotice(current ? "Modifications enregistrées." : "Entrepôt créé.");
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Entrepôts" subtitle="Vos lieux de stockage et le stock qu’ils détiennent.">
        {canWrite && <button type="button" className="btn btn-primary" onClick={() => { setFormError(""); setEditing("new"); }}><Plus size={18} /> Ajouter un entrepôt</button>}
      </PageHeader>
      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      {loading && !data ? <Loading /> : list.length === 0 ? (
        <Empty>Aucun entrepôt.</Empty>
      ) : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nom</th><th>Code</th><th>Statut</th><th className="num">Produits</th><th className="num">Unités</th><th /></tr></thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id}>
                  <td data-label="Nom"><strong>{w.name}</strong>{w.isDefault && <> <span className="badge badge-muted">Principal</span></>}</td>
                  <td data-label="Code">{w.code}</td>
                  <td data-label="Statut"><span className={`badge ${w.status === "active" ? "badge-ok" : "badge-muted"}`}>{w.status === "active" ? "Actif" : "Inactif"}</span></td>
                  <td data-label="Produits" className="num">{w.products}</td>
                  <td data-label="Unités" className="num">{w.units}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm" onClick={() => setViewing(w)}>Voir le stock</button>
                    {canWrite && <button type="button" className="btn btn-sm" onClick={() => { setFormError(""); setEditing(w); }}>Modifier</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}

      {viewing && <StockModal warehouse={viewing} onClose={() => setViewing(null)} />}

      {editing && (
        <Modal title={current ? `Modifier : ${current.name}` : "Nouvel entrepôt"} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            {formError && <Alert>{formError}</Alert>}
            <div className="form-grid">
              <Field label="Nom" span><input name="name" required minLength={2} defaultValue={current?.name} /></Field>
              <Field label="Code"><input name="code" required minLength={2} maxLength={20} defaultValue={current?.code} placeholder="DLA" /></Field>
              {current && (
                <Field label="Statut">
                  <select name="status" defaultValue={current.status}>
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                  </select>
                </Field>
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
