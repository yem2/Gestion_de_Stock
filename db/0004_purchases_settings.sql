-- Gestion de Stock: commandes fournisseurs (achats) et paramètres de l'entreprise.
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(60) PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  supplier_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'received', 'cancelled')),
  note TEXT,
  total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14, 2) NOT NULL CHECK (unit_cost >= 0)
);

CREATE INDEX IF NOT EXISTS purchase_orders_created_idx ON purchase_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_order_items_order_idx ON purchase_order_items (order_id);
