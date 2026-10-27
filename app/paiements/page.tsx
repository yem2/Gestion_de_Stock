import AppFrame from "@/components/app-frame";
import PaymentsView from "@/components/payments-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="payments.view" render={(role) => <PaymentsView role={role} />} />;
}
