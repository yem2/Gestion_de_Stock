"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { can, type Permission, type Role } from "@/lib/roles";
import { Alert, Empty, Field, Loading, Modal, PageHeader } from "@/components/ui";

type Contact = { id: string; name: string; phone: string | null; email: string | null; address?: string | null };

type Props = {
  role: Role;
  endpoint: "suppliers" | "customers";
  title: string;
  subtitle: string;
  singular: string;
  writePermission: Permission;
  withAddress?: boolean;
};

export default function ContactsView({ role, endpoint, title, subtitle, singular, writePermission, withAddress }: Props) {
  const { data, error, loading, reload } = useApi<Record<string, Contact[]>>(`/api/${endpoint}`);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const canWrite = can(role, writePermission);
  const list = data?.[endpoint] ?? [];
  const current = editing && editing !== "new" ? editing : null;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (current) await api(`/api/${endpoint}/${current.id}`, { method: "PATCH", body: JSON.stringify(form) });
      else await api(`/api/${endpoint}`, { method: "POST", body: JSON.stringify(form) });
      setEditing(null);
      setNotice(current ? "Modifications enregistrées." : `${singular} ajouté.`);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(contact: Contact) {
    if (!window.confirm(`Supprimer « ${contact.name} » ?`)) return;
    try {
      await api(`/api/${endpoint}/${contact.id}`, { method: "DELETE" });
      setNotice("Suppression effectuée.");
      await reload();
    } catch (e) {
      setNotice("");
      window.alert(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  return (
    <>
      <PageHeader title={title} subtitle={subtitle}>
        {canWrite && <button type="button" className="btn btn-primary" onClick={() => { setFormError(""); setEditing("new"); }}><Plus size={18} /> Ajouter</button>}
      </PageHeader>
      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      {loading && !data ? <Loading /> : list.length === 0 ? (
        <Empty>Aucun enregistrement pour l’instant.</Empty>
      ) : (
        <div className="table-card"><div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nom</th><th>Téléphone</th><th>E-mail</th>{withAddress && <th>Adresse</th>}{canWrite && <th />}</tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td data-label="Nom"><strong>{c.name}</strong></td>
                  <td data-label="Téléphone">{c.phone ?? "—"}</td>
                  <td data-label="E-mail">{c.email ?? "—"}</td>
                  {withAddress && <td data-label="Adresse">{c.address ?? "—"}</td>}
                  {canWrite && (
                    <td className="actions">
                      <button type="button" className="btn btn-sm" onClick={() => { setFormError(""); setEditing(c); }}>Modifier</button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(c)}>Supprimer</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}

      {editing && (
        <Modal title={current ? `Modifier : ${current.name}` : `Nouveau : ${singular.toLowerCase()}`} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            {formError && <Alert>{formError}</Alert>}
            <div className="form-grid">
              <Field label="Nom" span><input name="name" required minLength={2} defaultValue={current?.name} /></Field>
              <Field label="Téléphone"><input name="phone" type="tel" defaultValue={current?.phone ?? ""} /></Field>
              <Field label="E-mail"><input name="email" type="email" defaultValue={current?.email ?? ""} /></Field>
              {withAddress && <Field label="Adresse" span><input name="address" defaultValue={current?.address ?? ""} /></Field>}
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
