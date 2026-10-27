import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { ROLE_LABELS, getSessionUser, hasUsers, userCan } from "@/lib/auth";
import { type Permission, type Role } from "@/lib/roles";

/** Permissions qui déterminent les entrées visibles du menu. */
const NAV_PERMISSIONS: Permission[] = [
  "movements.view", "suppliers.view", "customers.view", "sales.view", "purchases.view", "reports.view",
  "users.manage", "audit.view", "settings.manage", "warehouses.view", "transfers.view", "inventory.view"
];

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
  if (permission && !userCan(user, permission)) redirect("/");
  return (
    <AppShell user={{ name: user.name, role: user.role, roleLabel: ROLE_LABELS[user.role], allowed: NAV_PERMISSIONS.filter((p) => userCan(user, p)) }}>
      {render(user.role)}
    </AppShell>
  );
}
