"use client";

import ContactsView from "@/components/contacts-view";
import type { Role } from "@/lib/roles";

export default function CustomersView({ role }: { role: Role }) {
  return (
    <ContactsView role={role} endpoint="customers" title="Clients" subtitle="Votre fichier clients." singular="Client" writePermission="customers.write" />
  );
}
