"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes } from "lucide-react";

type Mode = "login" | "setup";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Une erreur est survenue.");
        return;
      }
      router.replace(mode === "login" ? "/" : "/login");
      router.refresh();
    } catch {
      setError("Connexion au serveur impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span className="brand-mark"><Boxes size={24} /></span>
          <strong>Gestion de Stock</strong>
        </div>
        <h1>{mode === "login" ? "Connexion" : "Configuration initiale"}</h1>
        <p className="auth-sub">
          {mode === "login"
            ? "Connectez-vous pour accéder à votre espace."
            : "Créez le compte du super administrateur."}
        </p>
        {mode === "setup" && (
          <>
            <label>Clé de configuration<input name="setupKey" type="password" required autoComplete="off" /></label>
            <label>Nom complet<input name="name" type="text" required minLength={2} autoComplete="name" /></label>
          </>
        )}
        <label>E-mail<input name="email" type="email" required autoComplete="email" /></label>
        <label>
          Mot de passe
          <input
            name="password" type="password" required
            minLength={mode === "setup" ? 10 : 1}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        {mode === "setup" && <small>10 caractères minimum, avec lettres et chiffres.</small>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Patientez…" : mode === "login" ? "Se connecter" : "Créer le compte"}
        </button>
      </form>
    </main>
  );
}
