export const ROLES = ["super_admin", "admin", "manager", "storekeeper", "seller"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  manager: "Gestionnaire",
  storekeeper: "Magasinier",
  seller: "Vendeur"
};

/** Rôle RBAC (table roles) correspondant à chaque rôle historique de users.role. */
export const RBAC_ROLE_NAMES: Record<Role, string> = {
  super_admin: "Administrateur entreprise",
  admin: "Administrateur entreprise",
  manager: "Directeur",
  storekeeper: "Gestionnaire de stock",
  seller: "Vendeur / Caissier"
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
  | "purchases.view" | "purchases.write" | "purchases.receive" | "purchases.approve"
  | "audit.view" | "settings.manage"
  | "warehouses.view" | "warehouses.write"
  | "transfers.view" | "transfers.write" | "transfers.receive"
  | "inventory.view" | "inventory.count" | "inventory.approve";

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
  "purchases.approve": ["super_admin", "admin", "manager"],
  "audit.view": ["super_admin", "admin"],
  "settings.manage": ["super_admin", "admin"],
  "warehouses.view": ["super_admin", "admin", "manager", "storekeeper"],
  "warehouses.write": ["super_admin", "admin", "manager"],
  "transfers.view": ["super_admin", "admin", "manager", "storekeeper"],
  "transfers.write": ["super_admin", "admin", "manager", "storekeeper"],
  "transfers.receive": ["super_admin", "admin", "manager", "storekeeper"],
  "inventory.view": ["super_admin", "admin", "manager", "storekeeper"],
  "inventory.count": ["super_admin", "admin", "manager", "storekeeper"],
  "inventory.approve": ["super_admin", "admin", "manager"]
};

export function can(role: Role, permission: Permission) {
  return PERMISSIONS[permission].includes(role);
}

export function rolesFor(permission: Permission) {
  return PERMISSIONS[permission];
}
