"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes } from "lucide-react";

type Mode = "login" | "setup" | "forgot" | "reset";

const TITLES: Record<Mode, { title: string; sub: string }> = {
  login: { title: "Connexion", sub: "Connectez-vous pour accéder à votre espace." },
  setup: { title: "Configuration initiale", sub: "Créez le compte du super administrateur." },
  forgot: { title: "Mot de passe oublié", sub: "Saisissez l’e-mail de votre compte pour demander une réinitialisation." },
  reset: { title: "Nouveau mot de passe", sub: "Choisissez un nouveau mot de passe pour votre compte." }
};

export default function AuthForm({ mode, token }: { mode: Mode; token?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [loading, setLoading] = useState(false);
  const [useKey, setUseKey] = useState(false);

  async function post(url: string, payload: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string; token?: string };
    if (!response.ok) throw new Error(result.error ?? "Une erreur est survenue.");
    return result;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    if (mode === "reset" && data.password !== data.confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await post("/api/auth/login", data);
        router.replace("/");
        router.refresh();
      } else if (mode === "setup") {
        await post("/api/auth/setup", data);
        router.replace("/login");
        router.refresh();
      } else if (mode === "forgot" && useKey) {
        const result = await post("/api/auth/recover", { email: data.email, recoveryKey: data.recoveryKey });
        router.replace(`/reset-password?token=${encodeURIComponent(result.token ?? "")}`);
      } else if (mode === "forgot") {
        await post("/api/auth/forgot", { email: data.email });
        setDone(
          "Si un compte correspond à cet e-mail, votre demande est enregistrée. Si l’envoi d’e-mails est activé, vous recevrez un lien ; sinon, contactez votre administrateur qui vous remettra un lien de réinitialisation."
        );
      } else {
        await post("/api/auth/reset", { token, password: data.password });
        setDone("Mot de passe modifié. Vous pouvez maintenant vous connecter.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion au serveur impossible.");
    } finally {
      setLoading(false);
    }
  }

  const { title, sub } = TITLES[mode];
  const button =
    mode === "login" ? "Se connecter" : mode === "setup" ? "Créer le compte" : mode === "forgot" ? (useKey ? "Obtenir le lien" : "Envoyer la demande") : "Enregistrer le mot de passe";

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span className="brand-mark"><Boxes size={24} /></span>
          <strong>Gestion de Stock</strong>
        </div>
        <h1>{title}</h1>
        <p className="auth-sub">{sub}</p>

        {done ? (
          <>
            <p className="auth-ok" role="status">{done}</p>
            <Link className="auth-link" href="/login">Retour à la connexion</Link>
          </>
        ) : (
          <>
            {mode === "setup" && (
              <>
                <label>Clé de configuration<input name="setupKey" type="password" required autoComplete="off" /></label>
                <label>Nom complet<input name="name" type="text" required minLength={2} autoComplete="name" /></label>
              </>
            )}
            {mode !== "reset" && (
              <label>E-mail<input name="email" type="email" required autoComplete="email" /></label>
            )}
            {(mode === "login" || mode === "setup" || mode === "reset") && (
              <label>
                {mode === "reset" ? "Nouveau mot de passe" : "Mot de passe"}
                <input
                  name="password" type="password" required
                  minLength={mode === "login" ? 1 : 10}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </label>
            )}
            {mode === "reset" && (
              <label>Confirmer le mot de passe<input name="confirm" type="password" required minLength={10} autoComplete="new-password" /></label>
            )}
            {mode === "forgot" && useKey && (
              <label>Clé de récupération<input name="recoveryKey" type="password" required autoComplete="off" /></label>
            )}
            {(mode === "setup" || mode === "reset") && <small>10 caractères minimum, avec lettres et chiffres.</small>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" disabled={loading}>{loading ? "Patientez…" : button}</button>

            {mode === "login" && <Link className="auth-link" href="/forgot-password">Mot de passe oublié ?</Link>}
            {mode === "forgot" && (
              <>
                <button type="button" className="auth-text-btn" onClick={() => { setUseKey((v) => !v); setError(""); }}>
                  {useKey ? "Faire une demande normale" : "J’ai une clé de récupération"}
                </button>
                <Link className="auth-link" href="/login">Retour à la connexion</Link>
              </>
            )}
          </>
        )}
      </form>
    </main>
  );
}
