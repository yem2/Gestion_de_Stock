import AppFrame from "@/components/app-frame";
import TransfersView from "@/components/transfers-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="transfers.view" render={(role) => <TransfersView role={role} />} />;
}
