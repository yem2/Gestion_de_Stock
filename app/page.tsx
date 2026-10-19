import { redirect } from "next/navigation";
import StockDashboard from "@/components/stock-dashboard";
import { ROLE_LABELS, getSessionUser } from "@/lib/auth";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

async function hasUsers() {
  try {
    const rows = await getSql()`SELECT COUNT(*)::int AS count FROM users`;
    return Number(rows[0]?.count) > 0;
  } catch {
    return true;
  }
}

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect((await hasUsers()) ? "/login" : "/setup");
  }
  return <StockDashboard user={{ name: user.name, roleLabel: ROLE_LABELS[user.role], role: user.role }} />;
}
