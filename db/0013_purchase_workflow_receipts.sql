-- 0013 : achats — approbation optionnelle des commandes et réceptions partielles.
-- Statuts de commande : draft -> submitted -> ordered -> partially_received -> received (ou cancelled).
-- « ordered » = commande approuvée / passée, prête à être réceptionnée (statut déjà utilisé par l'application).
-- Les commandes existantes ne changent pas. Idempotente.

UPDATE purchase_order_items i SET quantity_received = i.quantity
FROM purchase_orders o WHERE o.id = i.order_id AND o.status = 'received' AND i.quantity_received = 0;

ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS quantity_received integer NOT NULL DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS quantity_rejected integer NOT NULL DEFAULT 0;
ALTER TABLE purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_receipt_check;
ALTER TABLE purchase_order_items ADD CONSTRAINT purchase_order_items_receipt_check
  CHECK (quantity_received >= 0 AND quantity_rejected >= 0 AND quantity_received + quantity_rejected <= quantity);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by bigint REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_number_idx ON purchase_orders (company_id, order_number) WHERE order_number IS NOT NULL;

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status::text = ANY (ARRAY['draft','submitted','ordered','partially_received','received','cancelled']));

CREATE TABLE IF NOT EXISTS goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  order_id bigint NOT NULL,
  receipt_number text NOT NULL,
  note text,
  received_by bigint REFERENCES users(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, company_id),
  UNIQUE (company_id, receipt_number),
  FOREIGN KEY (order_id, company_id) REFERENCES purchase_orders(id, company_id)
);
CREATE INDEX IF NOT EXISTS goods_receipts_order_idx ON goods_receipts (company_id, order_id);

CREATE TABLE IF NOT EXISTS goods_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  receipt_id uuid NOT NULL,
  order_item_id bigint NOT NULL REFERENCES purchase_order_items(id),
  product_id bigint NOT NULL,
  quantity_received integer NOT NULL CHECK (quantity_received >= 0),
  quantity_rejected integer NOT NULL CHECK (quantity_rejected >= 0),
  CHECK (quantity_received + quantity_rejected > 0),
  FOREIGN KEY (receipt_id, company_id) REFERENCES goods_receipts(id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id)
);

-- Réception atomique, complète ou partielle. p_lines = [{"itemId":…, "received":…, "rejected":…}] ;
-- NULL = tout le reste à recevoir. Le stock n'augmente que des quantités reçues (pas des rejetées).
CREATE OR REPLACE FUNCTION receive_purchase(p_company uuid, p_order bigint, p_user bigint, p_lines jsonb, p_note text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  o purchase_orders%ROWTYPE;
  x RECORD;
  it purchase_order_items%ROWTYPE;
  rid uuid := gen_random_uuid();
  seq bigint;
  rnum text;
  touched int := 0;
BEGIN
  SELECT * INTO o FROM purchase_orders WHERE id = p_order AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_NOT_FOUND'; END IF;
  IF o.status NOT IN ('ordered', 'partially_received') THEN RAISE EXCEPTION 'PURCHASE_BAD_STATUS'; END IF;

  IF p_lines IS NULL THEN
    SELECT jsonb_agg(jsonb_build_object('itemId', id, 'received', quantity - quantity_received - quantity_rejected, 'rejected', 0))
      INTO p_lines FROM purchase_order_items WHERE order_id = p_order;
  END IF;

  INSERT INTO document_sequences (company_id, document_type, period, next_value)
  VALUES (p_company, 'goods_receipt', to_char(now(), 'YYYY'), 2)
  ON CONFLICT (company_id, document_type, period) DO UPDATE SET next_value = document_sequences.next_value + 1
  RETURNING next_value - 1 INTO seq;
  rnum := 'REC-' || to_char(now(), 'YYYY') || '-' || lpad(seq::text, 5, '0');

  INSERT INTO goods_receipts (id, company_id, order_id, receipt_number, note, received_by)
  VALUES (rid, p_company, p_order, rnum, p_note, p_user);

  FOR x IN SELECT (e->>'itemId')::bigint AS item_id, COALESCE((e->>'received')::int, 0) AS rec, COALESCE((e->>'rejected')::int, 0) AS rej
           FROM jsonb_array_elements(p_lines) e ORDER BY 1 LOOP
    IF x.rec < 0 OR x.rej < 0 THEN RAISE EXCEPTION 'RECEIPT_INVALID'; END IF;
    IF x.rec = 0 AND x.rej = 0 THEN CONTINUE; END IF;
    SELECT * INTO it FROM purchase_order_items WHERE id = x.item_id AND order_id = p_order FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_INVALID'; END IF;
    IF x.rec + x.rej > it.quantity - it.quantity_received - it.quantity_rejected THEN
      RAISE EXCEPTION 'RECEIPT_EXCEEDS:%', it.product_id;
    END IF;
    UPDATE purchase_order_items SET quantity_received = quantity_received + x.rec, quantity_rejected = quantity_rejected + x.rej WHERE id = it.id;
    INSERT INTO goods_receipt_lines (company_id, receipt_id, order_item_id, product_id, quantity_received, quantity_rejected)
    VALUES (p_company, rid, it.id, it.product_id, x.rec, x.rej);
    IF x.rec > 0 THEN
      UPDATE products SET quantity = quantity + x.rec, updated_at = now() WHERE id = it.product_id AND company_id = p_company;
      INSERT INTO stock_movements (company_id, product_id, movement_type, quantity, note, user_id, supplier_id, source_type, source_id)
      VALUES (p_company, it.product_id, 'in', x.rec, 'Réception ' || rnum || ' (commande #' || p_order || ')', p_user, o.supplier_id, 'goods_receipt', rid::text);
    END IF;
    touched := touched + 1;
  END LOOP;
  IF touched = 0 THEN RAISE EXCEPTION 'RECEIPT_EMPTY'; END IF;

  IF EXISTS (SELECT 1 FROM purchase_order_items WHERE order_id = p_order AND quantity_received + quantity_rejected < quantity) THEN
    UPDATE purchase_orders SET status = 'partially_received' WHERE id = p_order;
  ELSE
    UPDATE purchase_orders SET status = 'received', received_at = now() WHERE id = p_order;
  END IF;
  RETURN rnum;
END
$$;
