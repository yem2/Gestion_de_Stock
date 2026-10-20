import AppFrame from "@/components/app-frame";
import AuditView from "@/components/audit-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame permission="audit.view" render={(role) => <AuditView role={role} />} />;
}
