import AppFrame from "@/components/app-frame";
import FinanceView from "@/components/finance-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="finance.view" render={(role) => <FinanceView role={role} />} />;
}
