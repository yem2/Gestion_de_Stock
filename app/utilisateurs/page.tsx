import AppFrame from "@/components/app-frame";
import UsersView from "@/components/users-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="users.manage" render={(role) => <UsersView role={role} />} />;
}
