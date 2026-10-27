"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi } from "@/lib/client";
import { can, type Role } from "@/lib/roles";
import { Alert, Field, Loading, PageHeader } from "@/components/ui";
import Avatar from "@/components/avatar";
import { resizeToAvatar } from "@/lib/image";
import type { Me } from "@/components/app-frame";

type Settings = { companyName: string; address: string; phone: string; footer: string };

/** Photo de profil : chaque utilisateur gère la sienne. */
function ProfilePhoto({ me }: { me: Me }) {
  const router = useRouter();
  const [version, setVersion] = useState<number | null>(me.avatarVersion);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMsg(null);
    setBusy(true);
    try {
      const image = await resizeToAvatar(file);
      const result = await api<{ version: number }>("/api/account/avatar", { method: "PUT", body: JSON.stringify(image) });
      setVersion(result.version);
      setMsg({ kind: "success", text: "Photo enregistrée." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Enregistrement impossible." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setMsg(null);
    setBusy(true);
    try {
      await api("/api/account/avatar", { method: "DELETE" });
      setVersion(null);
      setMsg({ kind: "success", text: "Photo retirée." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Suppression impossible." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Ma photo de profil</h3>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="profile-photo">
        <Avatar key={version ?? 0} userId={me.id} name={me.name} version={version} size={84} />
        <div className="profile-photo-actions">
          <label className="btn btn-primary">
            {version ? "Changer la photo" : "Ajouter une photo"}
            <input type="file" accept="image/*" onChange={onPick} disabled={busy} />
          </label>
          {version && <button type="button" className="btn" onClick={remove} disabled={busy}>Retirer</button>}
        </div>
      </div>
      <p className="hint">Elle est visible par les membres de votre entreprise. Elle est recadrée en carré et réduite automatiquement.</p>
    </section>
  );
}

export default function SettingsView({ role, me }: { role: Role; me: Me }) {
  const { data, loading, reload } = useApi<{ settings: Settings }>("/api/settings");
  const canEdit = can(role, "settings.manage");
  const [companyMsg, setCompanyMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pwdMsg, setPwdMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCompanyMsg(null);
    setBusy(true);
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(form) });
      setCompanyMsg({ kind: "success", text: "Paramètres enregistrés." });
      await reload();
    } catch (e) {
      setCompanyMsg({ kind: "error", text: e instanceof Error ? e.message : "Enregistrement impossible." });
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPwdMsg(null);
    const formElement = event.currentTarget;
    const form = Object.fromEntries(new FormData(formElement).entries()) as Record<string, string>;
    if (form.newPassword !== form.confirm) {
      setPwdMsg({ kind: "error", text: "Les deux nouveaux mots de passe ne correspondent pas." });
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      });
      formElement.reset();
      setPwdMsg({ kind: "success", text: "Mot de passe modifié. Vos autres sessions ont été fermées." });
    } catch (e) {
      setPwdMsg({ kind: "error", text: e instanceof Error ? e.message : "Changement impossible." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Votre compte et les informations de l’entreprise." />
      <div className="grid-2">
        <ProfilePhoto me={me} />
        <section className="card">
          <h3>Changer mon mot de passe</h3>
          {pwdMsg && <Alert kind={pwdMsg.kind}>{pwdMsg.text}</Alert>}
          <form onSubmit={changePassword}>
            <div className="form-grid">
              <Field label="Mot de passe actuel" span><input name="currentPassword" type="password" required autoComplete="current-password" /></Field>
              <Field label="Nouveau mot de passe"><input name="newPassword" type="password" required minLength={10} autoComplete="new-password" /></Field>
              <Field label="Confirmer"><input name="confirm" type="password" required minLength={10} autoComplete="new-password" /></Field>
              <p className="hint span-2">10 caractères minimum, avec lettres et chiffres.</p>
            </div>
            <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy}>Changer le mot de passe</button></div>
          </form>
        </section>

        <section className="card">
          <h3>Entreprise</h3>
          <p className="hint" style={{ marginBottom: 12 }}>Ces informations apparaissent sur les reçus de vente.</p>
          {loading && !data ? <Loading /> : data && (
            <form onSubmit={saveCompany} key={JSON.stringify(data.settings)}>
              {companyMsg && <Alert kind={companyMsg.kind}>{companyMsg.text}</Alert>}
              <div className="form-grid">
                <Field label="Nom de l’entreprise" span><input name="companyName" required minLength={2} defaultValue={data.settings.companyName} disabled={!canEdit} /></Field>
                <Field label="Adresse" span><input name="address" defaultValue={data.settings.address} disabled={!canEdit} /></Field>
                <Field label="Téléphone"><input name="phone" type="tel" defaultValue={data.settings.phone} disabled={!canEdit} /></Field>
                <Field label="Message en bas du reçu"><input name="footer" defaultValue={data.settings.footer} disabled={!canEdit} /></Field>
              </div>
              {canEdit ? (
                <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy}>Enregistrer</button></div>
              ) : (
                <p className="hint" style={{ marginTop: 12 }}>Seuls les administrateurs peuvent modifier ces informations.</p>
              )}
            </form>
          )}
        </section>
      </div>
    </>
  );
}
