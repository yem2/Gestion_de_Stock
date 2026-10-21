-- Gestion de Stock: entrepôts, unités, catégories et soldes par entrepôt (phase 03, première partie).
-- À exécuter après 0005. products.quantity est conservée (stock de l'entrepôt par défaut) ; voir 0007 pour la synchronisation.
CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code),
  UNIQUE (id, company_id)
);
CREATE UNIQUE INDEX warehouses_one_default_idx ON warehouses (company_id) WHERE is_default;

CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  symbol text NOT NULL,
  precision smallint NOT NULL DEFAULT 0 CHECK (precision BETWEEN 0 AND 4),
  UNIQUE (company_id, symbol),
  UNIQUE (id, company_id)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id uuid,
  name text NOT NULL,
  UNIQUE (company_id, name),
  UNIQUE (id, company_id),
  FOREIGN KEY (parent_id, company_id) REFERENCES categories(id, company_id)
);

ALTER TABLE products ADD COLUMN category_id uuid, ADD COLUMN base_unit_id uuid;
ALTER TABLE products ADD CONSTRAINT products_category_company_fk FOREIGN KEY (category_id, company_id) REFERENCES categories(id, company_id);
ALTER TABLE products ADD CONSTRAINT products_unit_company_fk FOREIGN KEY (base_unit_id, company_id) REFERENCES units(id, company_id);

CREATE TABLE stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL,
  product_id bigint NOT NULL,
  quantity_on_hand numeric(19,4) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved numeric(19,4) NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, warehouse_id, product_id),
  CHECK (quantity_reserved <= quantity_on_hand),
  FOREIGN KEY (warehouse_id, company_id) REFERENCES warehouses(id, company_id),
  FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id)
);
CREATE INDEX stock_balances_product_idx ON stock_balances (company_id, product_id);

ALTER TABLE stock_movements ADD COLUMN warehouse_id uuid, ADD COLUMN unit_cost numeric(19,4), ADD COLUMN source_type text, ADD COLUMN source_id text;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_warehouse_company_fk FOREIGN KEY (warehouse_id, company_id) REFERENCES warehouses(id, company_id);

INSERT INTO warehouses (company_id, name, code, is_default) SELECT id, 'Entrepôt principal', 'MAIN', true FROM companies;
INSERT INTO units (company_id, name, symbol, precision) SELECT id, 'Pièce', 'pc', 0 FROM companies;
INSERT INTO categories (company_id, name) SELECT DISTINCT company_id, btrim(category) FROM products WHERE category IS NOT NULL AND btrim(category) <> '';
UPDATE products p SET category_id = c.id FROM categories c WHERE c.company_id = p.company_id AND c.name = btrim(p.category);
UPDATE products p SET base_unit_id = u.id FROM units u WHERE u.company_id = p.company_id AND u.symbol = 'pc';
INSERT INTO stock_balances (company_id, warehouse_id, product_id, quantity_on_hand) SELECT p.company_id, w.id, p.id, p.quantity FROM products p JOIN warehouses w ON w.company_id = p.company_id AND w.is_default;
UPDATE stock_movements m SET warehouse_id = w.id FROM warehouses w WHERE w.company_id = m.company_id AND w.is_default;
