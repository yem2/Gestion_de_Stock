import Link from "next/link";
import AuthForm from "@/components/auth-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token || token.length < 20) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Lien invalide</h1>
          <p className="auth-sub">Ce lien de réinitialisation est incomplet ou a expiré.</p>
          <Link className="auth-link" href="/forgot-password">Refaire une demande</Link>
        </div>
      </main>
    );
  }
  return <AuthForm mode="reset" token={token} />;
}
