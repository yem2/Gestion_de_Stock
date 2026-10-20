import AppFrame from "@/components/app-frame";
import ProductsView from "@/components/products-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AppFrame render={(role) => <ProductsView role={role} />} />;
}
