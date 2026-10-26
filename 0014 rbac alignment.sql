-- 0014 : alignement des droits RBAC sur le comportement actuel de l'application.
-- Les permissions sont désormais lues depuis la base (roles -> role_permissions -> permissions).
-- Cette migration ajoute les codes manquants et ajuste les rôles système pour qu'aucun
-- utilisateur existant ne perde (ni ne gagne, hors cas listés dans le README) un droit.
-- Additive côté permissions ; idempotente.

INSERT INTO permissions (code, description) VALUES
  ('sales.cancel', 'Annuler une vente'),
  ('inventory.movements.read', 'Consulter le journal des mouvements'),
  ('inventory.count.read', 'Consulter les inventaires'),
  ('inventory.transfer.read', 'Consulter les transferts')
ON CONFLICT (code) DO NOTHING;

-- Administrateur entreprise : toutes les permissions du catalogue.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.is_system AND r.name = 'Administrateur entreprise'
ON CONFLICT DO NOTHING;

-- Autres rôles : droits ajoutés.
WITH grants(role_name, code) AS (VALUES
  ('Directeur', 'sales.cancel'), ('Directeur', 'inventory.movements.read'), ('Directeur', 'inventory.count.read'),
  ('Directeur', 'inventory.transfer.read'), ('Directeur', 'products.create'), ('Directeur', 'products.update'),
  ('Directeur', 'products.archive'), ('Directeur', 'inventory.adjust'), ('Directeur', 'inventory.count'),
  ('Directeur', 'inventory.transfer.create'), ('Directeur', 'inventory.transfer.ship'), ('Directeur', 'inventory.transfer.receive'),
  ('Directeur', 'warehouses.manage'), ('Directeur', 'suppliers.manage'), ('Directeur', 'customers.manage'),
  ('Directeur', 'sales.create'), ('Directeur', 'purchases.create'), ('Directeur', 'purchases.submit'),
  ('Directeur', 'purchases.cancel'), ('Directeur', 'purchases.receive'),
  ('Gestionnaire de stock', 'inventory.movements.read'), ('Gestionnaire de stock', 'inventory.count.read'),
  ('Gestionnaire de stock', 'inventory.transfer.read'), ('Gestionnaire de stock', 'purchases.read'),
  ('Gestionnaire de stock', 'purchases.receive'),
  ('Auditeur', 'inventory.movements.read'), ('Auditeur', 'inventory.count.read'), ('Auditeur', 'inventory.transfer.read')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM grants g
JOIN roles r ON r.is_system AND r.name = g.role_name
JOIN permissions p ON p.code = g.code
ON CONFLICT DO NOTHING;

-- L'approbation d'un inventaire revient au responsable, pas au gestionnaire de stock (cahier des charges 4.1).
DELETE FROM role_permissions rp USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.is_system AND r.name = 'Gestionnaire de stock' AND p.code = 'inventory.count.approve';
