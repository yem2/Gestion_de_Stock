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
  | "transfers.view" | "transfers.write" | "transfers.ship" | "transfers.receive"
  | "inventory.view" | "inventory.count" | "inventory.approve"
  | "payments.view" | "payments.write" | "payments.reverse"
  | "finance.view" | "expenses.write" | "expenses.approve";

const PERMISSIONS: Record<Permission, readonly Role[]> = {
  "products.write": ["super_admin", "admin", "manager", "storekeeper"],
  "products.archive": ["super_admin", "admin", "manager", "storekeeper"],
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
  "audit.view": ["super_admin", "admin", "manager"],
  "settings.manage": ["super_admin", "admin"],
  "warehouses.view": ["super_admin", "admin", "manager", "storekeeper"],
  "warehouses.write": ["super_admin", "admin", "manager"],
  "transfers.view": ["super_admin", "admin", "manager", "storekeeper"],
  "transfers.write": ["super_admin", "admin", "manager", "storekeeper"],
  "transfers.ship": ["super_admin", "admin", "manager", "storekeeper"],
  "transfers.receive": ["super_admin", "admin", "manager", "storekeeper"],
  "inventory.view": ["super_admin", "admin", "manager", "storekeeper"],
  "inventory.count": ["super_admin", "admin", "manager", "storekeeper"],
  "inventory.approve": ["super_admin", "admin", "manager"],
  "payments.view": ["super_admin", "admin", "manager", "seller"],
  "payments.write": ["super_admin", "admin", "seller"],
  "payments.reverse": ["super_admin", "admin", "manager"],
  "finance.view": ["super_admin", "admin", "manager"],
  "expenses.write": ["super_admin", "admin", "manager"],
  "expenses.approve": ["super_admin", "admin", "manager"]
};

export function can(role: Role, permission: Permission) {
  return PERMISSIONS[permission].includes(role);
}

/**
 * Codes de la table `permissions` (base de données) exigés pour chaque permission de l'application.
 * Les droits réels d'un utilisateur viennent de ses rôles en base : memberships -> membership_roles -> role_permissions.
 */
export const DB_PERMISSIONS: Record<Permission, readonly string[]> = {
  "products.write": ["products.create", "products.update"],
  "products.archive": ["products.archive"],
  "movements.view": ["inventory.movements.read"],
  "movements.write": ["inventory.adjust"],
  "suppliers.view": ["suppliers.read"],
  "suppliers.write": ["suppliers.manage"],
  "customers.view": ["customers.read"],
  "customers.write": ["customers.manage"],
  "sales.view": ["sales.read"],
  "sales.write": ["sales.create"],
  "sales.cancel": ["sales.cancel"],
  "reports.view": ["reports.finance.read"],
  "users.manage": ["users.manage"],
  "purchases.view": ["purchases.read"],
  "purchases.write": ["purchases.create"],
  "purchases.receive": ["purchases.receive"],
  "purchases.approve": ["purchases.approve"],
  "audit.view": ["audit.read"],
  "settings.manage": ["companies.manage"],
  "warehouses.view": ["warehouses.read"],
  "warehouses.write": ["warehouses.manage"],
  "transfers.view": ["inventory.transfer.read"],
  "transfers.write": ["inventory.transfer.create"],
  "transfers.ship": ["inventory.transfer.ship"],
  "transfers.receive": ["inventory.transfer.receive"],
  "inventory.view": ["inventory.count.read"],
  "inventory.count": ["inventory.count"],
  "inventory.approve": ["inventory.count.approve"],
  "payments.view": ["payments.read"],
  "payments.write": ["payments.record"],
  "payments.reverse": ["payments.reverse"],
  "finance.view": ["reports.finance.read"],
  "expenses.write": ["expenses.create"],
  "expenses.approve": ["expenses.approve"]
};

/** Liste de rôles historiques, étiquetée de la permission visée pour que le serveur vérifie la base. */
export type PermissionGuard = readonly Role[] & { permission?: Permission };

export function rolesFor(permission: Permission): PermissionGuard {
  return Object.assign([...PERMISSIONS[permission]], { permission });
}
