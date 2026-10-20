"use client";

import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { useApi } from "@/lib/client";
import { PAYMENT_LABELS, money } from "@/lib/format";
import type { Role } from "@/lib/roles";
import { Alert, Loading, PageHeader } from "@/components/ui";
import { SalesBars, type Summary } from "@/components/dashboard-view";

export default function ReportsView({ role }: { role: Role }) {
  void role;
  const [days, setDays] = useState(30);
  const { data, error, loading } = useApi<Summary>(`/api/reports/summary?days=${days}`);

  return (
    <>
      <PageHeader title="Rapports" subtitle="Analysez vos ventes et exportez vos données.">
        <button type="button" className="btn no-print" onClick={() => window.print()}><Printer size={18} /> Imprimer</button>
      </PageHeader>
      {error && <Alert>{error}</Alert>}

      <div className="toolbar no-print">
        <div className="chip-row">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" className={`chip${days === d ? " active" : ""}`} onClick={() => setDays(d)}>{d} jours</button>
          ))}
        </div>
      </div>

      {loading && !data && <Loading />}
      {data && (
        <div className="print-area">
          <div className="kpis">
            <div className="kpi accent"><span>Chiffre d’affaires ({data.days} j)</span><strong>{money(data.period.total)}</strong><small>{data.period.count} vente(s)</small></div>
            <div className="kpi"><span>Panier moyen</span><strong>{money(data.period.count ? Number(data.period.total) / data.period.count : 0)}</strong></div>
            <div className="kpi"><span>Valeur du stock</span><strong>{money(data.stock.value)}</strong><small>{data.stock.units} unité(s)</small></div>
            <div className="kpi"><span>Stock bas ou rupture</span><strong>{data.stock.lowCount}</strong></div>
          </div>
          <div className="grid-2">
            <section className="card"><h3>Ventes par jour</h3><SalesBars daily={data.daily} /></section>
            <section className="card">
              <h3>Modes de paiement</h3>
              {data.payments.length === 0 ? <p className="muted">Aucune vente sur la période.</p> : (
                <div className="list">
                  {data.payments.map((p) => (
                    <div className="list-row" key={p.method}>
                      <span>{PAYMENT_LABELS[p.method] ?? p.method}<small>{p.count} vente(s)</small></span>
                      <strong>{money(p.total)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="card">
              <h3>Produits les plus vendus</h3>
              {data.top.length === 0 ? <p className="muted">Aucune vente sur la période.</p> : (
                <div className="list">
                  {data.top.map((p) => (
                    <div className="list-row" key={p.name}>
                      <span>{p.name}<small>{p.quantity} unité(s)</small></span>
                      <strong>{money(p.total)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="card no-print">
              <h3>Exports (Excel / CSV)</h3>
              <div className="list">
                <a className="btn" href="/api/reports/export?type=products"><Download size={18} /> Produits et stock</a>
                <a className="btn" style={{ marginTop: 8 }} href="/api/reports/export?type=movements"><Download size={18} /> Mouvements de stock</a>
                <a className="btn" style={{ marginTop: 8 }} href="/api/reports/export?type=sales"><Download size={18} /> Ventes</a>
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
