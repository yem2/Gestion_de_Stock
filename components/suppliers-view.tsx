"use client";

import ContactsView from "@/components/contacts-view";
import type { Role } from "@/lib/roles";

export default function SuppliersView({ role }: { role: Role }) {
  return (
    <ContactsView role={role} endpoint="suppliers" title="Fournisseurs" subtitle="Ceux qui approvisionnent votre stock." singular="Fournisseur" writePermission="suppliers.write" withAddress />
  );
}
