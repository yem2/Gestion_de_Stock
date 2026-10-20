import AppFrame from "@/components/app-frame";
import PurchasesView from "@/components/purchases-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="purchases.view" render={(role) => <PurchasesView role={role} />} />;
}
