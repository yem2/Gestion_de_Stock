-- Gestion de Stock: synchronisation transitoire de stock_balances et index d'appartenance.
-- À exécuter après 0006 (une instruction à la fois dans le SQL Editor si nécessaire).
-- Tant que products.quantity reste la quantité de l'entrepôt par défaut, chaque modification met à jour son solde.
CREATE OR REPLACE FUNCTION sync_stock_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO stock_balances (company_id, warehouse_id, product_id, quantity_on_hand)
  SELECT NEW.company_id, w.id, NEW.id, NEW.quantity
  FROM warehouses w WHERE w.company_id = NEW.company_id AND w.is_default
  ON CONFLICT (company_id, warehouse_id, product_id)
  DO UPDATE SET quantity_on_hand = EXCLUDED.quantity_on_hand, updated_at = now();
  RETURN NULL;
END
$$;

CREATE TRIGGER products_sync_balance AFTER INSERT OR UPDATE OF quantity ON products
  FOR EACH ROW EXECUTE FUNCTION sync_stock_balance();

-- Un mouvement sans entrepôt explicite est rattaché à l'entrepôt par défaut de son entreprise.
CREATE OR REPLACE FUNCTION set_movement_warehouse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.warehouse_id IS NULL THEN
    SELECT id INTO NEW.warehouse_id FROM warehouses WHERE company_id = NEW.company_id AND is_default;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER stock_movements_default_wh BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION set_movement_warehouse();

CREATE INDEX IF NOT EXISTS company_memberships_user_idx ON company_memberships (user_id);
