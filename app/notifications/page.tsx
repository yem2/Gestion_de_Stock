import AppFrame from "@/components/app-frame";
import NotificationsView from "@/components/notifications-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame render={() => <NotificationsView />} />;
}
