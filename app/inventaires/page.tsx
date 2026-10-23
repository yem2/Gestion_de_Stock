import AppFrame from "@/components/app-frame";
import InventoryView from "@/components/inventory-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="inventory.view" render={(role) => <InventoryView role={role} />} />;
}
