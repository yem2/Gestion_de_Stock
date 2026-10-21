-- Gestion de Stock: multi-entreprises + RBAC (phase 02 du cahier des charges).
-- À exécuter UNE SEULE FOIS dans la base Neon, après 0000 → 0004. Testé sur une branche Neon avant production.
-- Les données existantes sont rattachées à l'entreprise « Entreprise par défaut » (UUID fixe ...0001).
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  currency char(3) NOT NULL DEFAULT 'XAF',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO companies (id, name, slug) VALUES ('00000000-0000-0000-0000-000000000001', 'Entreprise par défaut', 'default');

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name),
  UNIQUE (id, company_id)
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE company_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id),
  UNIQUE (id, company_id)
);

CREATE TABLE membership_roles (
  company_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  role_id uuid NOT NULL,
  PRIMARY KEY (membership_id, role_id),
  FOREIGN KEY (membership_id, company_id) REFERENCES company_memberships(id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (role_id, company_id) REFERENCES roles(id, company_id) ON DELETE CASCADE
);

INSERT INTO permissions (code) VALUES
('companies.manage'),('users.manage'),('roles.manage'),('audit.read'),
('products.read'),('products.create'),('products.update'),('products.archive'),
('warehouses.read'),('warehouses.manage'),
('inventory.read'),('inventory.adjust'),('inventory.transfer.create'),('inventory.transfer.ship'),
('inventory.transfer.receive'),('inventory.count'),('inventory.count.approve'),
('suppliers.read'),('suppliers.manage'),
('purchases.read'),('purchases.create'),('purchases.submit'),('purchases.approve'),('purchases.receive'),('purchases.cancel'),
('customers.read'),('customers.manage'),
('sales.read'),('sales.create'),('sales.validate'),('sales.discount.override'),('sales.return'),('sales.refund'),
('payments.read'),('payments.record'),('payments.reverse'),
('expenses.read'),('expenses.create'),('expenses.approve'),
('reports.stock.read'),('reports.finance.read');

INSERT INTO roles (company_id, name, is_system) VALUES
('00000000-0000-0000-0000-000000000001','Administrateur entreprise',true),
('00000000-0000-0000-0000-000000000001','Directeur',true),
('00000000-0000-0000-0000-000000000001','Gestionnaire de stock',true),
('00000000-0000-0000-0000-000000000001','Responsable achats',true),
('00000000-0000-0000-0000-000000000001','Vendeur / Caissier',true),
('00000000-0000-0000-0000-000000000001','Comptable',true),
('00000000-0000-0000-0000-000000000001','Auditeur',true);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN (VALUES
  ('Administrateur entreprise', '.*'),
  ('Directeur', '\.read$|\.approve$|^sales\.validate$|^payments\.reverse$'),
  ('Gestionnaire de stock', '^(products\.(read|create|update|archive)|warehouses\.read|inventory\..*|reports\.stock\.read|suppliers\.read)$'),
  ('Responsable achats', '^(suppliers\..*|purchases\..*|products\.read|inventory\.read|warehouses\.read|reports\.stock\.read)$'),
  ('Vendeur / Caissier', '^(products\.read|inventory\.read|customers\..*|sales\.(read|create|validate|return)|payments\.(read|record))$'),
  ('Comptable', '^(payments\..*|expenses\..*|sales\.(read|refund)|purchases\.read|customers\.read|suppliers\.read|reports\..*)$'),
  ('Auditeur', '\.read$')
) AS t(name, pattern) ON t.name = r.name
JOIN permissions p ON p.code ~ t.pattern;

INSERT INTO company_memberships (company_id, user_id, status)
SELECT '00000000-0000-0000-0000-000000000001', u.id, CASE WHEN u.active THEN 'active' ELSE 'suspended' END FROM users u;

INSERT INTO membership_roles (company_id, membership_id, role_id)
SELECT m.company_id, m.id, r.id
FROM company_memberships m
JOIN users u ON u.id = m.user_id
JOIN roles r ON r.company_id = m.company_id AND r.name = CASE u.role
  WHEN 'super_admin' THEN 'Administrateur entreprise'
  WHEN 'admin' THEN 'Administrateur entreprise'
  WHEN 'manager' THEN 'Directeur'
  WHEN 'storekeeper' THEN 'Gestionnaire de stock'
  WHEN 'seller' THEN 'Vendeur / Caissier' END;

-- company_id sur les tables métier. Le DEFAULT est TRANSITOIRE : il est retiré par 0008 une fois le nouveau code déployé.
ALTER TABLE products ADD COLUMN company_id uuid REFERENCES companies(id);
UPDATE products SET company_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE products ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX products_company_idx ON products (company_id);
ALTER TABLE products ADD CONSTRAINT products_id_company_key UNIQUE (id, company_id);

ALTER TABLE suppliers ADD COLUMN company_id uuid REFERENCES companies(id);
UPDATE suppliers SET company_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE suppliers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX suppliers_company_idx ON suppliers (company_id);
ALTER TABLE suppliers ADD CONSTRAINT suppliers_id_company_key UNIQUE (id, company_id);

ALTER TABLE customers ADD COLUMN company_id uuid REFERENCES companies(id);
UPDATE customers SET company_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE customers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE customers ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX customers_company_idx ON customers (company_id);
ALTER TABLE customers ADD CONSTRAINT customers_id_company_key UNIQUE (id, company_id);

ALTER TABLE purchase_orders ADD COLUMN company_id uuid REFERENCES companies(id);
UPDATE purchase_orders SET company_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE purchase_orders ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE purchase_orders ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX purchase_orders_company_idx ON purchase_orders (company_id);
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_id_company_key UNIQUE (id, company_id);

ALTER TABLE sales ADD COLUMN company_id uuid REFERENCES companies(id);
UPDATE sales SET company_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE sales ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE sales ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX sales_company_idx ON sales (company_id);
ALTER TABLE sales ADD CONSTRAINT sales_id_company_key UNIQUE (id, company_id);

ALTER TABLE stock_movements ADD COLUMN company_id uuid REFERENCES companies(id);
UPDATE stock_movements SET company_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE stock_movements ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE stock_movements ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX stock_movements_company_idx ON stock_movements (company_id);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_id_company_key UNIQUE (id, company_id);

ALTER TABLE audit_log ADD COLUMN company_id uuid REFERENCES companies(id);
UPDATE audit_log SET company_id = '00000000-0000-0000-0000-000000000001';
CREATE INDEX audit_log_company_idx ON audit_log (company_id, created_at DESC);

-- SKU unique par entreprise (et non plus global).
ALTER TABLE products DROP CONSTRAINT products_sku_key;
ALTER TABLE products ADD CONSTRAINT products_company_sku_key UNIQUE (company_id, sku);

-- Clés étrangères composites : impossible de relier des données de deux entreprises différentes.
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_product_company_fk FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_supplier_company_fk FOREIGN KEY (supplier_id, company_id) REFERENCES suppliers(id, company_id);
ALTER TABLE sales ADD CONSTRAINT sales_customer_company_fk FOREIGN KEY (customer_id, company_id) REFERENCES customers(id, company_id);
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_supplier_company_fk FOREIGN KEY (supplier_id, company_id) REFERENCES suppliers(id, company_id);
