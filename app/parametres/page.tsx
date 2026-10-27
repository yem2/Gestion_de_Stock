import AppFrame from "@/components/app-frame";
import SettingsView from "@/components/settings-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame render={(role, me) => <SettingsView role={role} me={me} />} />;
}
