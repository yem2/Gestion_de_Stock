"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { dateTime } from "@/lib/format";
import { ROLE_LABELS, isRole, type Role } from "@/lib/roles";
import { Alert, Empty, Field, Loading, Modal, PageHeader } from "@/components/ui";

type UserRow = { id: string; email: string; name: string; role: string; active: boolean; lastLoginAt: string | null };

const ASSIGNABLE: Role[] = ["admin", "manager", "storekeeper", "seller"];

export default function UsersView({ role }: { role: Role }) {
  const { data, error, loading, reload } = useApi<{ users: UserRow[] }>("/api/users");
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const current = editing && editing !== "new" ? editing : null;
  // Un administrateur ne peut attribuer que des rôles inférieurs au sien.
  const roles = role === "super_admin" ? ASSIGNABLE : ASSIGNABLE.filter((r) => r !== "admin");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (current) {
        const body: Record<string, unknown> = { name: form.name };
        if (current.role !== "super_admin") {
          body.role = form.role;
          body.active = form.active === "true";
        }
        if (typeof form.password === "string" && form.password) body.password = form.password;
        await api(`/api/users/${current.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setNotice("Utilisateur modifié.");
      } else {
        await api("/api/users", { method: "POST", body: JSON.stringify(form) });
        setNotice("Utilisateur créé.");
      }
      setEditing(null);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  const list = data?.users ?? [];

  return (
    <>
      <PageHeader title="Utilisateurs" subtitle="Comptes de l’équipe et niveaux d’accès.">
        <button type="button" className="btn btn-primary" onClick={() => { setFormError(""); setEditing("new"); }}><Plus size={18} /> Nouvel utilisateur</button>
      </PageHeader>
      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      {loading && !data ? <Loading /> : list.length === 0 ? <Empty>Aucun utilisateur.</Empty> : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th /></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td data-label="Nom"><strong>{u.name}</strong></td>
                  <td data-label="E-mail">{u.email}</td>
                  <td data-label="Rôle">{isRole(u.role) ? ROLE_LABELS[u.role] : u.role}</td>
                  <td data-label="Statut"><span className={`badge ${u.active ? "badge-ok" : "badge-danger"}`}>{u.active ? "Actif" : "Désactivé"}</span></td>
                  <td data-label="Dernière connexion">{dateTime(u.lastLoginAt)}</td>
                  <td className="actions">
                    {(role === "super_admin" || (isRole(u.role) && u.role !== "admin" && u.role !== "super_admin")) && (
                      <button type="button" className="btn btn-sm" onClick={() => { setFormError(""); setEditing(u); }}>Modifier</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}

      {editing && (
        <Modal title={current ? `Modifier : ${current.name}` : "Nouvel utilisateur"} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            {formError && <Alert>{formError}</Alert>}
            <div className="form-grid">
              <Field label="Nom complet" span><input name="name" required minLength={2} defaultValue={current?.name} /></Field>
              {!current && <Field label="E-mail" span><input name="email" type="email" required /></Field>}
              {current?.role !== "super_admin" && (
                <Field label="Rôle">
                  <select name="role" defaultValue={current?.role ?? "seller"}>
                    {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </Field>
              )}
              {current && current.role !== "super_admin" && (
                <Field label="Statut">
                  <select name="active" defaultValue={String(current.active)}>
                    <option value="true">Actif</option>
                    <option value="false">Désactivé</option>
                  </select>
                </Field>
              )}
              <Field label={current ? "Nouveau mot de passe (facultatif)" : "Mot de passe"} span>
                <input name="password" type="password" autoComplete="new-password" required={!current} minLength={10} />
              </Field>
              <p className="hint span-2">10 caractères minimum, avec lettres et chiffres. Changer le mot de passe ou le rôle ferme les sessions ouvertes de cet utilisateur.</p>
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
