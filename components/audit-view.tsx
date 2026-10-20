"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useApi } from "@/lib/client";
import { dateTime } from "@/lib/format";
import type { Role } from "@/lib/roles";
import { Alert, Empty, Loading, PageHeader } from "@/components/ui";

type Entry = { id: string; action: string; entity: string | null; entityId: string | null; detail: string | null; createdAt: string; userName: string | null };

const LABELS: Record<string, string> = {
  login: "Connexion", logout: "Déconnexion", login_locked: "Compte bloqué (trop d’échecs)",
  setup_super_admin: "Création du super administrateur",
  user_create: "Utilisateur créé", user_update: "Utilisateur modifié",
  product_create: "Produit créé", product_update: "Produit modifié", product_archive: "Produit archivé",
  movement_in: "Entrée de stock", movement_out: "Sortie de stock", movement_adjustment: "Inventaire",
  supplier_create: "Fournisseur créé", supplier_update: "Fournisseur modifié", supplier_delete: "Fournisseur supprimé",
  customer_create: "Client créé", customer_update: "Client modifié", customer_delete: "Client supprimé",
  sale_create: "Vente enregistrée", sale_cancel: "Vente annulée",
  purchase_create: "Commande fournisseur créée", purchase_receive: "Commande réceptionnée", purchase_cancel: "Commande annulée",
  export: "Export de données", settings_update: "Paramètres modifiés",
  password_change: "Mot de passe changé", password_change_failed: "Échec de changement de mot de passe",
  password_reset_request: "Demande de réinitialisation", password_reset_link: "Lien de réinitialisation généré",
  password_reset_done: "Mot de passe réinitialisé", password_recovery_key: "Récupération par clé", recovery_failed: "Échec de clé de récupération"
};

export default function AuditView({ role }: { role: Role }) {
  void role;
  const { data, error, loading } = useApi<{ entries: Entry[] }>("/api/audit");
  const [query, setQuery] = useState("");

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.entries ?? []).filter((e) =>
      !q || (LABELS[e.action] ?? e.action).toLowerCase().includes(q) || (e.userName ?? "").toLowerCase().includes(q) || (e.detail ?? "").toLowerCase().includes(q)
    );
  }, [data, query]);

  return (
    <>
      <PageHeader title="Journal d’activité" subtitle="Les 300 dernières actions enregistrées dans l’application." />
      {error && <Alert>{error}</Alert>}
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input type="search" placeholder="Filtrer par action, utilisateur, détail…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filtrer" />
        </div>
      </div>
      {loading && !data ? <Loading /> : entries.length === 0 ? <Empty>Aucune activité à afficher.</Empty> : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Élément</th><th>Détail</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td data-label="Date">{dateTime(e.createdAt)}</td>
                  <td data-label="Utilisateur">{e.userName ?? "—"}</td>
                  <td data-label="Action"><strong>{LABELS[e.action] ?? e.action}</strong></td>
                  <td data-label="Élément">{e.entity ? `${e.entity}${e.entityId ? ` #${e.entityId}` : ""}` : "—"}</td>
                  <td data-label="Détail">{e.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </>
  );
}
