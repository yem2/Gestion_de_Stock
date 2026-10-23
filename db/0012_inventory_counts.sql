-- 0012 : inventaires physiques.
-- 1) Une seule session d'inventaire active (ouverte ou soumise) par entrepôt.
-- 2) Le déclencheur de soldes peut être suspendu (app.skip_stock_sync) par les fonctions
--    qui règlent elles-mêmes les soldes par entrepôt.
-- 3) approve_inventory_count : applique les écarts (compté - attendu) à l'entrepôt de l'inventaire,
--    met à jour le total du produit et journalise un mouvement « adjustment » par écart.

CREATE UNIQUE INDEX IF NOT EXISTS inventory_counts_one_active_idx
  ON inventory_counts (company_id, warehouse_id) WHERE status IN ('open','submitted');

CREATE OR REPLACE FUNCTION sync_stock_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  delta numeric;
  wh uuid;
BEGIN
  -- Les fonctions qui règlent elles-mêmes les soldes par entrepôt (inventaire) désactivent la synchronisation.
  IF current_setting('app.skip_stock_sync', true) = '1' THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    delta := NEW.quantity;
  ELSE
    delta := NEW.quantity - OLD.quantity;
  END IF;
  IF delta = 0 THEN RETURN NULL; END IF;
  SELECT id INTO wh FROM warehouses WHERE company_id = NEW.company_id AND is_default;
  IF wh IS NULL THEN RETURN NULL; END IF;
  -- UPDATE d'abord : un INSERT ... ON CONFLICT contrôle la ligne proposée (variation négative) avant le conflit.
  UPDATE stock_balances SET quantity_on_hand = quantity_on_hand + delta, updated_at = now()
   WHERE company_id = NEW.company_id AND warehouse_id = wh AND product_id = NEW.id;
  IF NOT FOUND THEN
    INSERT INTO stock_balances (company_id, warehouse_id, product_id, quantity_on_hand)
    VALUES (NEW.company_id, wh, NEW.id, delta);
  END IF;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION approve_inventory_count(p_company uuid, p_count uuid, p_user bigint) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  c inventory_counts%ROWTYPE;
  l RECORD;
  v numeric;
  adjusted int := 0;
BEGIN
  SELECT * INTO c FROM inventory_counts WHERE id = p_count AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_NOT_FOUND'; END IF;
  IF c.status <> 'submitted' THEN RAISE EXCEPTION 'INVENTORY_BAD_STATUS'; END IF;
  -- Soldes par entrepôt réglés ici ; products.quantity (total) suit la même variation.
  PERFORM set_config('app.skip_stock_sync', '1', true);
  FOR l IN SELECT product_id, expected_quantity, counted_quantity FROM inventory_count_lines
           WHERE count_id = p_count AND company_id = p_company
             AND counted_quantity IS NOT NULL AND counted_quantity <> expected_quantity
           ORDER BY product_id LOOP
    v := l.counted_quantity - l.expected_quantity;
    UPDATE stock_balances SET quantity_on_hand = quantity_on_hand + v, updated_at = now()
     WHERE company_id = p_company AND warehouse_id = c.warehouse_id AND product_id = l.product_id;
    IF NOT FOUND THEN
      IF v < 0 THEN RAISE EXCEPTION 'INVENTORY_STOCK_CHANGED:%', l.product_id; END IF;
      INSERT INTO stock_balances (company_id, warehouse_id, product_id, quantity_on_hand)
      VALUES (p_company, c.warehouse_id, l.product_id, v);
    END IF;
    UPDATE products SET quantity = quantity + v WHERE id = l.product_id AND company_id = p_company;
    INSERT INTO stock_movements (company_id, product_id, movement_type, quantity, note, user_id, warehouse_id, source_type, source_id)
    VALUES (p_company, l.product_id, 'adjustment', ABS(v)::int,
            'Inventaire ' || c.count_number || ' : ' || l.expected_quantity::int || ' → ' || l.counted_quantity::int,
            p_user, c.warehouse_id, 'inventory_count', p_count::text);
    adjusted := adjusted + 1;
  END LOOP;
  PERFORM set_config('app.skip_stock_sync', '', true);
  UPDATE inventory_counts SET status = 'approved', approved_by = p_user, approved_at = now() WHERE id = p_count;
  RETURN adjusted;
END
$$;
