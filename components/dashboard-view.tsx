"use client";

import Link from "next/link";
import { useApi } from "@/lib/client";
import { MOVEMENT_LABELS, dateTime, dayLabel, money } from "@/lib/format";
import { can, type Role } from "@/lib/roles";
import { Alert, Loading, PageHeader } from "@/components/ui";

export type Summary = {
  days: number;
  stock: { productCount: number; units: number; value: string; lowCount: number };
  today: { total: string; count: number };
  period: { total: string; count: number };
  daily: { day: string; total: string }[];
  payments: { method: string; total: string; count: number }[];
  top: { name: string; quantity: number; total: string }[];
  lowStock: { id: string; name: string; sku: string; quantity: number; minQuantity: number }[];
  recent: { id: string; type: string; quantity: number; createdAt: string; productName: string }[];
};

export function SalesBars({ daily }: { daily: Summary["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => Number(d.total)));
  const step = Math.ceil(daily.length / 7);
  return (
    <div className="bars" role="img" aria-label="Ventes par jour">
      {daily.map((d, index) => (
        <div key={d.day} className={`bar${index % step === 0 || index === daily.length - 1 ? "" : " quiet"}`} title={`${dayLabel(d.day)} : ${money(d.total)}`}>
          <i style={{ height: `${Math.max(1, (Number(d.total) / max) * 100)}%` }} />
          <em>{dayLabel(d.day)}</em>
        </div>
      ))}
    </div>
  );
}

export default function DashboardView({ role }: { role: Role }) {
  const { data, error, loading } = useApi<Summary>("/api/reports/summary?days=7");

  return (
    <>
      <PageHeader title="Vue d’ensemble" subtitle="Gardez un œil sur votre stock, vos ventes et vos opérations." />
      {error && <Alert>{error}</Alert>}
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="kpis">
            <div className="kpi"><span>Références produits</span><strong>{data.stock.productCount}</strong><small>Produits enregistrés</small></div>
            <div className="kpi"><span>Unités en stock</span><strong>{data.stock.units}</strong><small>Quantité disponible</small></div>
            <div className="kpi"><span>Valeur du stock</span><strong>{money(data.stock.value)}</strong><small>Au prix de vente</small></div>
            <div className="kpi accent"><span>Stock bas ou rupture</span><strong>{data.stock.lowCount}</strong><small>À réapprovisionner</small></div>
            <div className="kpi"><span>Ventes du jour</span><strong>{money(data.today.total)}</strong><small>{data.today.count} vente(s)</small></div>
            <div className="kpi"><span>Ventes sur 7 jours</span><strong>{money(data.period.total)}</strong><small>{data.period.count} vente(s)</small></div>
          </div>

          <div className="grid-2">
            <section className="card">
              <h3>Ventes des 7 derniers jours</h3>
              <SalesBars daily={data.daily} />
            </section>
            <section className="card">
              <h3>Produits à réapprovisionner</h3>
              {data.lowStock.length === 0 ? (
                <p className="muted">Aucun produit sous le seuil minimum.</p>
              ) : (
                <div className="list">
                  {data.lowStock.map((p) => (
                    <div className="list-row" key={p.id}>
                      <span>{p.name}<small>{p.sku} · seuil {p.minQuantity}</small></span>
                      <span className={`badge ${p.quantity <= 0 ? "badge-danger" : "badge-warn"}`}>{p.quantity} en stock</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {can(role, "movements.view") && (
              <section className="card">
                <h3>Derniers mouvements</h3>
                {data.recent.length === 0 ? (
                  <p className="muted">Aucun mouvement pour l’instant.</p>
                ) : (
                  <div className="list">
                    {data.recent.map((m) => (
                      <div className="list-row" key={m.id}>
                        <span>{m.productName}<small>{dateTime(m.createdAt)}</small></span>
                        <span className={`badge ${m.type === "in" ? "badge-ok" : m.type === "out" ? "badge-warn" : "badge-muted"}`}>
                          {MOVEMENT_LABELS[m.type]} · {m.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ marginTop: 12 }}><Link href="/mouvements" className="btn btn-sm">Voir tous les mouvements</Link></p>
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}
