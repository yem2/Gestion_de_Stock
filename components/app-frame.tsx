import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { ROLE_LABELS, getSessionUser, hasUsers } from "@/lib/auth";
import { can, type Permission, type Role } from "@/lib/roles";

/** Vérifie la session et le droit d'accès, puis affiche la page dans le menu adaptable. */
export default async function AppFrame({
  permission,
  render
}: {
  permission?: Permission;
  render: (role: Role) => React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect((await hasUsers()) ? "/login" : "/setup");
  if (permission && !can(user.role, permission)) redirect("/");
  return (
    <AppShell user={{ name: user.name, role: user.role, roleLabel: ROLE_LABELS[user.role] }}>
      {render(user.role)}
    </AppShell>
  );
}
