import AppFrame from "@/components/app-frame";
import SuppliersView from "@/components/suppliers-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="suppliers.view" render={(role) => <SuppliersView role={role} />} />;
}
