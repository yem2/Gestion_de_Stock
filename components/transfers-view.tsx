"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { dateTime } from "@/lib/format";
import { can, type Role } from "@/lib/roles";
import { Alert, Empty, Field, Loading, Modal, PageHeader } from "@/components/ui";

type Status = "draft" | "shipped" | "received" | "cancelled";
type Transfer = {
  id: string; number: string; status: Status; note: string | null; createdAt: string;
  source: string; destination: string; createdBy: string | null; lines: number; units: number;
};
type Warehouse = { id: string; name: string; code: string; status: "active" | "inactive" };
type StockLine = { id: number; sku: string; name: string; available: number };
type DetailLine = { id: string; sku: string; name: string; requested: number; shipped: number; received: number };

const STATUS: Record<Status, { label: string; badge: string }> = {
  draft: { label: "Brouillon", badge: "badge-muted" },
  shipped: { label: "En transit", badge: "badge-warn" },
  received: { label: "Reçu", badge: "badge-ok" },
  cancelled: { label: "Annulé", badge: "badge-danger" }
};

function NewTransfer({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const { data: whData } = useApi<{ warehouses: Warehouse[] }>("/api/warehouses");
  const warehouses = (whData?.warehouses ?? []).filter((w) => w.status === "active");
  const [sourceId, setSourceId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [stock, setStock] = useState<StockLine[]>([]);
  const [lines, setLines] = useState<{ productId: string; quantity: string }[]>([{ productId: "", quantity: "1" }]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function changeSource(id: string) {
    setSourceId(id);
    setLines([{ productId: "", quantity: "1" }]);
    setStock([]);
  }

  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    api<{ stock: StockLine[] }>(`/api/warehouses/${sourceId}/stock`)
      .then((data) => { if (alive) setStock(data.stock); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Chargement du stock impossible."); });
    return () => { alive = false; };
  }, [sourceId]);

  function setLine(index: number, patch: Partial<{ productId: string; quantity: string }>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const result = await api<{ number: string }>("/api/transfers", {
        method: "POST",
        body: JSON.stringify({
          sourceId,
          destinationId,
          note,
          lines: lines.map((l) => ({ productId: Number(l.productId), quantity: Number(l.quantity) }))
        })
      });
      onSaved(`Transfert ${result.number} créé en brouillon.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible.");
    } finally {
      setSaving(false);
    }
  }

  const used = new Set(lines.map((l) => l.productId));

  return (
    <Modal title="Nouveau transfert" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <Field label="Entrepôt d’origine" span>
            <select value={sourceId} onChange={(e) => changeSource(e.target.value)} required>
              <option value="">Choisir…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id} disabled={w.id === destinationId}>{w.name} ({w.code})</option>)}
            </select>
          </Field>
          <Field label="Entrepôt de destination" span>
            <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} required>
              <option value="">Choisir…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id} disabled={w.id === sourceId}>{w.name} ({w.code})</option>)}
            </select>
          </Field>
        </div>
        <p className="hint" style={{ marginBottom: 8 }}>Produits à transférer</p>
        {sourceId && stock.length === 0 && <p className="hint">Cet entrepôt ne contient aucun produit en stock.</p>}
        {lines.map((line, index) => {
          const selected = stock.find((s) => String(s.id) === line.productId);
          return (
            <div className="sale-line" key={index}>
              <select value={line.productId} onChange={(e) => setLine(index, { productId: e.target.value })} required>
                <option value="">Produit…</option>
                {stock.map((s) => <option key={s.id} value={s.id} disabled={used.has(String(s.id)) && line.productId !== String(s.id)}>{s.name} ({s.available} dispo.)</option>)}
              </select>
              <input type="number" min={1} max={selected?.available} step={1} value={line.quantity} onChange={(e) => setLine(index, { quantity: e.target.value })} required aria-label="Quantité" />
              <button type="button" className="icon-btn" onClick={() => setLines((c) => (c.length > 1 ? c.filter((_, i) => i !== index) : c))} aria-label="Retirer la ligne"><Trash2 size={18} /></button>
            </div>
          );
        })}
        <button type="button" className="btn btn-sm" onClick={() => setLines((c) => [...c, { productId: "", quantity: "1" }])} disabled={!sourceId}><Plus size={16} /> Ajouter un produit</button>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Note (facultatif)" span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Enregistrement…" : "Créer le brouillon"}</button>
        </div>
      </form>
    </Modal>
  );
}

function DetailModal({ transfer, role, onClose, onChanged }: { transfer: Transfer; role: Role; onClose: () => void; onChanged: (message: string) => void }) {
  const [lines, setLines] = useState<DetailLine[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ lines: DetailLine[] }>(`/api/transfers/${transfer.id}`)
      .then((data) => setLines(data.lines))
      .catch((e) => setError(e instanceof Error ? e.message : "Chargement impossible."));
  }, [transfer.id]);

  async function act(action: "ship" | "receive" | "cancel", message: string, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/transfers/${transfer.id}/${action}`, { method: "POST" });
      onChanged(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  const canWrite = can(role, "transfers.write");
  const canReceive = can(role, "transfers.receive");

  return (
    <Modal title={`Transfert ${transfer.number}`} onClose={onClose}>
      {error && <Alert>{error}</Alert>}
      <p className="hint" style={{ marginBottom: 10 }}>
        {transfer.source} → {transfer.destination} · <span className={`badge ${STATUS[transfer.status].badge}`}>{STATUS[transfer.status].label}</span>
      </p>
      {transfer.note && <p style={{ marginBottom: 10 }}>{transfer.note}</p>}
      {!lines && !error ? <Loading /> : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>Produit</th><th className="num">Demandé</th><th className="num">Expédié</th><th className="num">Reçu</th></tr></thead>
            <tbody>
              {lines?.map((l) => (
                <tr key={l.id}>
                  <td data-label="Produit"><strong>{l.name}</strong> <small>{l.sku}</small></td>
                  <td data-label="Demandé" className="num">{l.requested}</td>
                  <td data-label="Expédié" className="num">{l.shipped}</td>
                  <td data-label="Reçu" className="num">{l.received}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
      <div className="form-actions">
        {transfer.status === "draft" && canWrite && <button type="button" className="btn btn-danger" disabled={busy} onClick={() => act("cancel", "Transfert annulé.", "Annuler ce brouillon ?")}>Annuler le transfert</button>}
        {transfer.status === "draft" && canWrite && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act("ship", "Transfert expédié : le stock est en transit.", "Expédier ? Le stock sera retiré de l’entrepôt d’origine.")}>Expédier</button>}
        {transfer.status === "shipped" && canReceive && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act("receive", "Transfert reçu : le stock est disponible à destination.", "Confirmer la réception complète ?")}>Marquer comme reçu</button>}
        <button type="button" className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

export default function TransfersView({ role }: { role: Role }) {
  const { data, error, loading, reload } = useApi<{ transfers: Transfer[] }>("/api/transfers");
  const [creating, setCreating] = useState(false);
  const [opened, setOpened] = useState<Transfer | null>(null);
  const [notice, setNotice] = useState("");
  const list = data?.transfers ?? [];

  return (
    <>
      <PageHeader title="Transferts" subtitle="Déplacez du stock d’un entrepôt à un autre, avec expédition puis réception.">
        {can(role, "transfers.write") && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} /> Nouveau transfert</button>}
      </PageHeader>
      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      {loading && !data ? <Loading /> : list.length === 0 ? (
        <Empty>Aucun transfert pour l’instant.</Empty>
      ) : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>Numéro</th><th>Trajet</th><th>Statut</th><th className="num">Produits</th><th className="num">Unités</th><th>Date</th><th /></tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td data-label="Numéro"><strong>{t.number}</strong></td>
                  <td data-label="Trajet">{t.source} → {t.destination}</td>
                  <td data-label="Statut"><span className={`badge ${STATUS[t.status].badge}`}>{STATUS[t.status].label}</span></td>
                  <td data-label="Produits" className="num">{t.lines}</td>
                  <td data-label="Unités" className="num">{t.units}</td>
                  <td data-label="Date">{dateTime(t.createdAt)}</td>
                  <td className="actions"><button type="button" className="btn btn-sm" onClick={() => setOpened(t)}>Ouvrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}

      {creating && <NewTransfer onClose={() => setCreating(false)} onSaved={(message) => { setCreating(false); setNotice(message); void reload(); }} />}
      {opened && <DetailModal transfer={opened} role={role} onClose={() => setOpened(null)} onChanged={(message) => { setOpened(null); setNotice(message); void reload(); }} />}
    </>
  );
}
