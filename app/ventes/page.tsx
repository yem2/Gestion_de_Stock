import AppFrame from "@/components/app-frame";
import SalesView from "@/components/sales-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="sales.view" render={(role) => <SalesView role={role} />} />;
}
