// Rôles et droits : fichier sans dépendance serveur, utilisable aussi côté navigateur.
export const ROLES = ["super_admin", "admin", "manager", "storekeeper", "seller"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  manager: "Gestionnaire",
  storekeeper: "Magasinier",
  seller: "Vendeur"
};

export const ROLE_RANK: Record<Role, number> = {
  super_admin: 4,
  admin: 3,
  manager: 2,
  storekeeper: 1,
  seller: 0
};

/** Peuvent créer des produits et enregistrer des entrées / sorties de stock. */
export const STOCK_WRITERS = ["super_admin", "admin", "manager", "storekeeper"] as const;
/** Peuvent modifier / archiver les produits et faire des ajustements d'inventaire. */
export const STOCK_MANAGERS = ["super_admin", "admin", "manager"] as const;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function roleRank(role: Role) {
  return ROLE_RANK[role];
}

/** Un utilisateur peut gérer uniquement des rôles strictement inférieurs, sauf le super administrateur. */
export function canManageRole(actor: Role, target: Role) {
  if (actor === "super_admin") return true;
  if (actor !== "admin") return false;
  return ROLE_RANK[target] < ROLE_RANK[actor];
}

export const canWriteStock = (role: Role) => (STOCK_WRITERS as readonly string[]).includes(role);
export const canManageStock = (role: Role) => (STOCK_MANAGERS as readonly string[]).includes(role);
