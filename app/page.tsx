import AppFrame from "@/components/app-frame";
import DashboardView from "@/components/dashboard-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame render={(role) => <DashboardView role={role} />} />;
}
