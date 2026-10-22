-- 0011 : transferts entre entrepôts.
-- 1) Le stock total d'un produit (products.quantity) reste la somme « entrepôts + en transit ».
--    Le déclencheur applique donc la VARIATION de products.quantity à l'entrepôt par défaut
--    (l'ancienne version recopiait le total, ce qui devient faux dès qu'un 2e entrepôt a du stock).
-- 2) Deux nouveaux types de mouvement : transfer_out / transfer_in.
-- 3) Fonctions atomiques ship_transfer / receive_transfer / cancel_transfer.

CREATE OR REPLACE FUNCTION sync_stock_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  delta numeric;
  wh uuid;
BEGIN
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

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type::text = ANY (ARRAY['in','out','adjustment','transfer_out','transfer_in']));

CREATE OR REPLACE FUNCTION ship_transfer(p_company uuid, p_transfer uuid, p_user bigint) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  t stock_transfers%ROWTYPE;
  l RECORD;
BEGIN
  SELECT * INTO t FROM stock_transfers WHERE id = p_transfer AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFER_NOT_FOUND'; END IF;
  IF t.status <> 'draft' THEN RAISE EXCEPTION 'TRANSFER_BAD_STATUS'; END IF;
  IF NOT EXISTS (SELECT 1 FROM stock_transfer_lines WHERE transfer_id = p_transfer AND company_id = p_company) THEN
    RAISE EXCEPTION 'TRANSFER_EMPTY';
  END IF;
  FOR l IN SELECT id, product_id, quantity_requested FROM stock_transfer_lines
           WHERE transfer_id = p_transfer AND company_id = p_company ORDER BY product_id LOOP
    UPDATE stock_balances
       SET quantity_on_hand = quantity_on_hand - l.quantity_requested, updated_at = now()
     WHERE company_id = p_company AND warehouse_id = t.source_warehouse_id AND product_id = l.product_id
       AND quantity_on_hand - quantity_reserved >= l.quantity_requested;
    IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', l.product_id; END IF;
    UPDATE stock_transfer_lines SET quantity_shipped = l.quantity_requested WHERE id = l.id;
    INSERT INTO stock_movements (company_id, product_id, movement_type, quantity, note, user_id, warehouse_id, source_type, source_id)
    VALUES (p_company, l.product_id, 'transfer_out', l.quantity_requested::int, 'Transfert ' || t.transfer_number, p_user, t.source_warehouse_id, 'transfer', p_transfer::text);
  END LOOP;
  UPDATE stock_transfers SET status = 'shipped', shipped_at = now() WHERE id = p_transfer;
END
$$;

CREATE OR REPLACE FUNCTION receive_transfer(p_company uuid, p_transfer uuid, p_user bigint) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  t stock_transfers%ROWTYPE;
  l RECORD;
  remaining numeric;
BEGIN
  SELECT * INTO t FROM stock_transfers WHERE id = p_transfer AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFER_NOT_FOUND'; END IF;
  IF t.status <> 'shipped' THEN RAISE EXCEPTION 'TRANSFER_BAD_STATUS'; END IF;
  FOR l IN SELECT id, product_id, quantity_shipped, quantity_received FROM stock_transfer_lines
           WHERE transfer_id = p_transfer AND company_id = p_company ORDER BY product_id LOOP
    remaining := l.quantity_shipped - l.quantity_received;
    IF remaining <= 0 THEN CONTINUE; END IF;
    INSERT INTO stock_balances (company_id, warehouse_id, product_id, quantity_on_hand)
    VALUES (p_company, t.destination_warehouse_id, l.product_id, remaining)
    ON CONFLICT (company_id, warehouse_id, product_id)
    DO UPDATE SET quantity_on_hand = stock_balances.quantity_on_hand + EXCLUDED.quantity_on_hand, updated_at = now();
    UPDATE stock_transfer_lines SET quantity_received = quantity_shipped WHERE id = l.id;
    INSERT INTO stock_movements (company_id, product_id, movement_type, quantity, note, user_id, warehouse_id, source_type, source_id)
    VALUES (p_company, l.product_id, 'transfer_in', remaining::int, 'Transfert ' || t.transfer_number, p_user, t.destination_warehouse_id, 'transfer', p_transfer::text);
  END LOOP;
  UPDATE stock_transfers SET status = 'received', received_at = now() WHERE id = p_transfer;
END
$$;

CREATE OR REPLACE FUNCTION cancel_transfer(p_company uuid, p_transfer uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  t stock_transfers%ROWTYPE;
BEGIN
  SELECT * INTO t FROM stock_transfers WHERE id = p_transfer AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFER_NOT_FOUND'; END IF;
  IF t.status <> 'draft' THEN RAISE EXCEPTION 'TRANSFER_BAD_STATUS'; END IF;
  UPDATE stock_transfers SET status = 'cancelled' WHERE id = p_transfer;
END
$$;
