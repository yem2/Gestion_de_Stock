import AppFrame from "@/components/app-frame";
import MovementsView from "@/components/movements-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="movements.view" render={(role) => <MovementsView role={role} />} />;
}
