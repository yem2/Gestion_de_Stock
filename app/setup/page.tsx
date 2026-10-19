import { notFound } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!process.env.SETUP_KEY) notFound();
  try {
    const rows = await getSql()`SELECT COUNT(*)::int AS count FROM users`;
    if (Number(rows[0]?.count) > 0) notFound();
  } catch {
    notFound();
  }
  return <AuthForm mode="setup" />;
}
