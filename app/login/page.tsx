import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  return <AuthForm mode="login" />;
}
