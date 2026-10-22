import AppFrame from "@/components/app-frame";
import WarehousesView from "@/components/warehouses-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="warehouses.view" render={(role) => <WarehousesView role={role} />} />;
}
