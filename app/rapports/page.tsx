import AppFrame from "@/components/app-frame";
import ReportsView from "@/components/reports-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="reports.view" render={(role) => <ReportsView role={role} />} />;
}
