import AppFrame from "@/components/app-frame";
import CustomersView from "@/components/customers-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="customers.view" render={(role) => <CustomersView role={role} />} />;
}
