export const ROLES = ["super_admin", "admin", "manager", "storekeeper", "seller"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  manager: "Gestionnaire",
  storekeeper: "Magasinier",
  seller: "Vendeur"
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export type Permission =
  | "products.write" | "products.archive"
  | "movements.view" | "movements.write"
  | "suppliers.view" | "suppliers.write"
  | "customers.view" | "customers.write"
  | "sales.view" | "sales.write" | "sales.cancel"
  | "reports.view" | "users.manage"
  | "purchases.view" | "purchases.write" | "purchases.receive"
  | "audit.view" | "settings.manage";

const PERMISSIONS: Record<Permission, readonly Role[]> = {
  "products.write": ["super_admin", "admin", "manager", "storekeeper"],
  "products.archive": ["super_admin", "admin", "manager"],
  "movements.view": ["super_admin", "admin", "manager", "storekeeper"],
  "movements.write": ["super_admin", "admin", "manager", "storekeeper"],
  "suppliers.view": ["super_admin", "admin", "manager", "storekeeper"],
  "suppliers.write": ["super_admin", "admin", "manager"],
  "customers.view": ["super_admin", "admin", "manager", "seller"],
  "customers.write": ["super_admin", "admin", "manager", "seller"],
  "sales.view": ["super_admin", "admin", "manager", "seller"],
  "sales.write": ["super_admin", "admin", "manager", "seller"],
  "sales.cancel": ["super_admin", "admin", "manager"],
  "reports.view": ["super_admin", "admin", "manager"],
  "users.manage": ["super_admin", "admin"],
  "purchases.view": ["super_admin", "admin", "manager", "storekeeper"],
  "purchases.write": ["super_admin", "admin", "manager"],
  "purchases.receive": ["super_admin", "admin", "manager", "storekeeper"],
  "audit.view": ["super_admin", "admin"],
  "settings.manage": ["super_admin", "admin"]
};

export function can(role: Role, permission: Permission) {
  return PERMISSIONS[permission].includes(role);
}

export function rolesFor(permission: Permission) {
  return PERMISSIONS[permission];
}
