"use client";

import { useState } from "react";
import { Activity, Plus } from "lucide-react";
import { MOVEMENT_LABELS, formatDate, type Movement, type MovementType } from "@/components/types";

type Props = {
  movements: Movement[];
  loading: boolean;
  error: string;
  canWrite: boolean;
  onNew: () => void;
  onRefresh: () => void;
};

const FILTERS: { value: MovementType | "all"; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "in", label: "Entrées" },
  { value: "out", label: "Sorties" },
  { value: "adjustment", label: "Ajustements" }
];

export default function MovementsView({ movements, loading, error, canWrite, onNew, onRefresh }: Props) {
  const [filter, setFilter] = useState<MovementType | "all">("all");
  const shown = filter === "all" ? movements : movements.filter((m) => m.type === filter);

  return (
    <section className="table-panel">
      <div className="panel-heading">
        <div>
          <h2>Mouvements de stock</h2>
          <p>Les 100 derniers mouvements : entrées, sorties et ajustements d’inventaire.</p>
        </div>
        <div className="row-actions">
          <button className="secondary-button" type="button" onClick={onRefresh}><Activity size={16} /> Actualiser</button>
          {canWrite && <button className="primary-button" type="button" onClick={onNew}><Plus size={16} /> Nouveau mouvement</button>}
        </div>
      </div>
      <div className="table-toolbar">
        <div className="filter-tabs" role="group" aria-label="Filtrer par type">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" className={`filter-tab ${filter === f.value ? "active" : ""}`} onClick={() => setFilter(f.value)}>{f.label}</button>
          ))}
        </div>
        <div className="table-count">{shown.length} mouvement{shown.length > 1 ? "s" : ""}</div>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>DATE</th><th>PRODUIT</th><th>TYPE</th><th>QUANTITÉ</th><th>STOCK</th><th>PAR</th><th>NOTE</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="empty-state">Chargement des mouvements…</td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="empty-state"><strong>Mouvements indisponibles</strong><span>{error}</span></td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={7} className="empty-state"><strong>Aucun mouvement</strong><span>Les entrées, sorties et ajustements apparaîtront ici.</span></td></tr>
            ) : shown.map((m) => (
              <tr key={m.id}>
                <td>{formatDate(m.createdAt)}</td>
                <td><strong>{m.productName}</strong> <span className="sku">{m.productSku}</span></td>
                <td><span className={`move-pill move-${m.type}`}>{MOVEMENT_LABELS[m.type]}</span></td>
                <td><strong>{m.type === "in" ? "+" : m.type === "out" ? "−" : "±"}{Number(m.quantity).toLocaleString("fr-FR")}</strong></td>
                <td>{m.quantityBefore ?? "—"} → {m.quantityAfter ?? "—"}</td>
                <td>{m.userName ?? "—"}</td>
                <td className="note-cell">{m.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
