-- Gestion de Stock: mouvements de stock traçables, archivage des produits, limitation des connexions par IP.
-- À exécuter dans la base Neon de ce projet, après 0000 et 0001. Peut être relancé sans risque.
ALTER TABLE products ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS products_archived_idx ON products (archived);

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS quantity_before INTEGER;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS quantity_after INTEGER;
CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON stock_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements (product_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, created_at DESC);
