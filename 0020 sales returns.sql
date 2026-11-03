-- 0020 : retours clients, avoirs et remboursements (cahier des charges 3.5, 7.5, 7.6).
-- - Un retour référence la vente d'origine et ne peut pas dépasser les quantités restantes (7.5).
-- - Produit en bon état : remis en stock ; produit endommagé : jamais remis en stock vendable (7.5).
-- - Reste dû = total facturé − avoirs (retours) − paiements affectés, jamais négatif (7.6) : un retour sur une vente
--   à crédit réduit d'abord la créance.
-- - Remboursement = paiement sortant distinct du retour physique (7.5) : possible seulement dans la limite de ce qui a été
--   payé en trop, et il fait baisser la trésorerie.
-- - Tout est conservé : un retour n'est jamais supprimé. Additive, idempotente.

CREATE TABLE IF NOT EXISTS sales_returns (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  return_number text NOT NULL,
  sale_id bigint NOT NULL,
  total_amount numeric(19,4) NOT NULL CHECK (total_amount > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  created_by bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, company_id),
  UNIQUE (company_id, return_number),
  FOREIGN KEY (sale_id, company_id) REFERENCES sales(id, company_id)
);
CREATE INDEX IF NOT EXISTS sales_returns_sale_idx ON sales_returns (company_id, sale_id);
CREATE INDEX IF NOT EXISTS sales_returns_list_idx ON sales_returns (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sales_return_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  return_id bigint NOT NULL,
  sale_item_id bigint NOT NULL REFERENCES sale_items(id),
  product_id bigint NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(19,4) NOT NULL CHECK (unit_price >= 0),
  unit_cost numeric(19,4) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  condition text NOT NULL CHECK (condition IN ('good', 'damaged')),
  FOREIGN KEY (return_id, company_id) REFERENCES sales_returns(id, company_id),
  FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id)
);
CREATE INDEX IF NOT EXISTS sales_return_lines_item_idx ON sales_return_lines (sale_item_id);
CREATE INDEX IF NOT EXISTS sales_return_lines_return_idx ON sales_return_lines (return_id);

ALTER TABLE payment_allocations DROP CONSTRAINT IF EXISTS payment_allocations_document_type_check;
ALTER TABLE payment_allocations ADD CONSTRAINT payment_allocations_document_type_check
  CHECK (document_type IN ('sale', 'purchase_order', 'sales_return'));

-- Soldes de vente avec avoirs : colonnes ajoutées à la fin (returned, refunded, refundable) ; due ne devient jamais négatif.
CREATE OR REPLACE VIEW sale_balances AS
SELECT s.company_id, s.id AS sale_id, s.customer_id, s.status, s.created_at, s.total_amount AS total,
       COALESCE(x.paid, 0) AS paid, COALESCE(x.pending, 0) AS pending,
       GREATEST(s.total_amount - COALESCE(x.paid, 0) - COALESCE(r.returned, 0), 0) AS due,
       COALESCE(r.returned, 0) AS returned,
       COALESCE(rf.refunded, 0) AS refunded,
       GREATEST(COALESCE(x.paid, 0) - (s.total_amount - COALESCE(r.returned, 0)), 0) - COALESCE(rf.refunded, 0) AS refundable
FROM sales s
LEFT JOIN LATERAL (
  SELECT SUM(a.allocated_amount) FILTER (WHERE p.status = 'posted') AS paid,
         SUM(a.allocated_amount) FILTER (WHERE p.status = 'pending') AS pending
  FROM payment_allocations a
  JOIN payments p ON p.id = a.payment_id AND p.company_id = a.company_id
  WHERE a.company_id = s.company_id AND a.document_type = 'sale' AND a.document_id = s.id
) x ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(sr.total_amount) AS returned FROM sales_returns sr WHERE sr.sale_id = s.id AND sr.company_id = s.company_id
) r ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(a.allocated_amount) AS refunded
  FROM payment_allocations a
  JOIN payments p ON p.id = a.payment_id AND p.company_id = a.company_id AND p.status = 'posted'
  JOIN sales_returns sr ON sr.id = a.document_id AND sr.company_id = a.company_id
  WHERE a.document_type = 'sales_return' AND sr.sale_id = s.id AND a.company_id = s.company_id
) rf ON TRUE;

-- record_payment : le montant encaissable sur une vente tient compte des retours (avoirs).
CREATE OR REPLACE FUNCTION record_payment(
  p_company uuid, p_user bigint, p_direction text, p_customer bigint, p_supplier bigint, p_amount numeric,
  p_method uuid, p_reference text, p_note text, p_allocations jsonb,
  p_status text DEFAULT 'posted', p_provider text DEFAULT NULL, p_provider_reference text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  pid uuid := gen_random_uuid();
  seq bigint;
  pnum text;
  x RECORD;
  doc_total numeric;
  doc_party bigint;
  doc_open boolean;
  committed numeric;
  allocated numeric := 0;
  party text := 'other';
BEGIN
  IF p_direction NOT IN ('in', 'out') OR p_amount IS NULL OR p_amount <= 0 OR p_status NOT IN ('posted', 'pending') THEN
    RAISE EXCEPTION 'PAYMENT_INVALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = p_method AND company_id = p_company AND status = 'active') THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_INVALID';
  END IF;
  IF p_customer IS NOT NULL AND p_supplier IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_INVALID'; END IF;
  IF p_direction = 'in' AND p_supplier IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_INVALID'; END IF;
  IF p_direction = 'out' AND p_customer IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_INVALID'; END IF;
  IF p_customer IS NOT NULL THEN party := 'customer'; END IF;
  IF p_supplier IS NOT NULL THEN party := 'supplier'; END IF;

  INSERT INTO document_sequences (company_id, document_type, period, next_value)
  VALUES (p_company, 'payment', to_char(now(), 'YYYY'), 2)
  ON CONFLICT (company_id, document_type, period) DO UPDATE SET next_value = document_sequences.next_value + 1
  RETURNING next_value - 1 INTO seq;
  pnum := 'PAY-' || to_char(now(), 'YYYY') || '-' || lpad(seq::text, 5, '0');

  INSERT INTO payments (id, company_id, payment_number, direction, party_type, customer_id, supplier_id, amount, method_id,
                        status, reference, provider, provider_reference, note, created_by)
  VALUES (pid, p_company, pnum, p_direction, party, p_customer, p_supplier, p_amount, p_method,
          p_status, p_reference, p_provider, p_provider_reference, p_note, p_user);

  FOR x IN SELECT e->>'documentType' AS dtype, (e->>'documentId')::bigint AS did, (e->>'amount')::numeric AS amt
           FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) e ORDER BY 1, 2 LOOP
    IF x.amt IS NULL OR x.amt <= 0 THEN RAISE EXCEPTION 'PAYMENT_INVALID'; END IF;
    IF x.dtype = 'sale' AND p_direction = 'in' THEN
      SELECT total_amount - COALESCE((SELECT SUM(sr.total_amount) FROM sales_returns sr WHERE sr.sale_id = sales.id AND sr.company_id = sales.company_id), 0),
             customer_id, (status = 'completed')
        INTO doc_total, doc_party, doc_open
        FROM sales WHERE id = x.did AND company_id = p_company FOR UPDATE;
    ELSIF x.dtype = 'purchase_order' AND p_direction = 'out' THEN
      SELECT total_cost, supplier_id, (status IN ('ordered', 'partially_received', 'received')) INTO doc_total, doc_party, doc_open
        FROM purchase_orders WHERE id = x.did AND company_id = p_company FOR UPDATE;
    ELSE
      RAISE EXCEPTION 'PAYMENT_INVALID';
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_DOCUMENT_NOT_FOUND'; END IF;
    IF NOT doc_open THEN RAISE EXCEPTION 'PAYMENT_DOCUMENT_CLOSED'; END IF;
    IF (x.dtype = 'sale' AND p_customer IS NOT NULL AND doc_party IS DISTINCT FROM p_customer)
       OR (x.dtype = 'purchase_order' AND p_supplier IS NOT NULL AND doc_party IS DISTINCT FROM p_supplier) THEN
      RAISE EXCEPTION 'PAYMENT_PARTY_MISMATCH';
    END IF;
    SELECT COALESCE(SUM(a.allocated_amount), 0) INTO committed
      FROM payment_allocations a JOIN payments p ON p.id = a.payment_id AND p.company_id = a.company_id
      WHERE a.company_id = p_company AND a.document_type = x.dtype AND a.document_id = x.did AND p.status IN ('posted', 'pending');
    IF x.amt > doc_total - committed THEN RAISE EXCEPTION 'PAYMENT_EXCEEDS_DUE:%', x.did; END IF;
    INSERT INTO payment_allocations (company_id, payment_id, document_type, document_id, allocated_amount)
    VALUES (p_company, pid, x.dtype, x.did, x.amt);
    allocated := allocated + x.amt;
  END LOOP;
  IF allocated > p_amount THEN RAISE EXCEPTION 'PAYMENT_ALLOCATION_EXCEEDS'; END IF;
  RETURN jsonb_build_object('id', pid, 'number', pnum, 'allocated', allocated);
END
$$;

-- Crée un retour client. p_lines = [{"saleItemId":…, "quantity":…, "condition":"good"|"damaged"}].
-- Remboursement optionnel (p_refund_method + p_refund_amount), limité à ce qui a été payé en trop.
CREATE OR REPLACE FUNCTION create_sales_return(
  p_company uuid, p_user bigint, p_sale bigint, p_lines jsonb, p_reason text, p_refund_method uuid, p_refund_amount numeric
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  s sales%ROWTYPE;
  x RECORD;
  it sale_items%ROWTYPE;
  rid bigint;
  seq bigint;
  rnum text;
  total numeric := 0;
  already int;
  refundable numeric;
  refunded numeric := 0;
  pid uuid;
  pseq bigint;
  pnum text;
BEGIN
  SELECT * INTO s FROM sales WHERE id = p_sale AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RETURN_SALE_NOT_FOUND'; END IF;
  IF s.status <> 'completed' THEN RAISE EXCEPTION 'RETURN_SALE_CLOSED'; END IF;

  -- 1) validation des lignes (la vente verrouillée empêche deux retours simultanés de dépasser les quantités)
  FOR x IN SELECT "saleItemId" AS item_id, quantity AS qty, condition AS cond
           FROM jsonb_to_recordset(p_lines) AS e("saleItemId" bigint, quantity int, condition text) LOOP
    IF x.qty IS NULL OR x.qty <= 0 OR x.cond NOT IN ('good', 'damaged') THEN RAISE EXCEPTION 'RETURN_INVALID'; END IF;
    SELECT * INTO it FROM sale_items WHERE id = x.item_id AND sale_id = p_sale;
    IF NOT FOUND THEN RAISE EXCEPTION 'RETURN_INVALID'; END IF;
    SELECT COALESCE(SUM(quantity), 0) INTO already FROM sales_return_lines WHERE sale_item_id = it.id;
    IF x.qty > it.quantity - already THEN RAISE EXCEPTION 'RETURN_EXCEEDS:%', it.product_id; END IF;
    total := total + x.qty * it.unit_price;
  END LOOP;
  IF total <= 0 THEN RAISE EXCEPTION 'RETURN_EMPTY'; END IF;

  INSERT INTO document_sequences (company_id, document_type, period, next_value)
  VALUES (p_company, 'sales_return', to_char(now(), 'YYYY'), 2)
  ON CONFLICT (company_id, document_type, period) DO UPDATE SET next_value = document_sequences.next_value + 1
  RETURNING next_value - 1 INTO seq;
  rnum := 'RET-' || to_char(now(), 'YYYY') || '-' || lpad(seq::text, 5, '0');

  INSERT INTO sales_returns (company_id, return_number, sale_id, total_amount, reason, created_by)
  VALUES (p_company, rnum, p_sale, total, btrim(p_reason), p_user) RETURNING id INTO rid;

  -- 2) lignes, remise en stock des produits en bon état uniquement
  FOR x IN SELECT "saleItemId" AS item_id, quantity AS qty, condition AS cond
           FROM jsonb_to_recordset(p_lines) AS e("saleItemId" bigint, quantity int, condition text) ORDER BY 1 LOOP
    SELECT * INTO it FROM sale_items WHERE id = x.item_id AND sale_id = p_sale;
    INSERT INTO sales_return_lines (company_id, return_id, sale_item_id, product_id, quantity, unit_price, unit_cost, condition)
    VALUES (p_company, rid, it.id, it.product_id, x.qty, it.unit_price, it.unit_cost, x.cond);
    IF x.cond = 'good' THEN
      UPDATE products SET quantity = quantity + x.qty, updated_at = now() WHERE id = it.product_id AND company_id = p_company;
      INSERT INTO stock_movements (company_id, product_id, movement_type, quantity, note, user_id, source_type, source_id, unit_cost)
      VALUES (p_company, it.product_id, 'in', x.qty, 'Retour client ' || rnum || ' (vente #' || p_sale || ')', p_user, 'sales_return', rid::text, it.unit_cost);
    END IF;
  END LOOP;

  -- 3) remboursement éventuel : paiement sortant, limité à ce qui a été payé en trop
  SELECT b.refundable INTO refundable FROM sale_balances b WHERE b.sale_id = p_sale AND b.company_id = p_company;
  IF p_refund_amount IS NOT NULL AND p_refund_amount > 0 THEN
    IF p_refund_method IS NULL OR NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = p_refund_method AND company_id = p_company AND status = 'active') THEN
      RAISE EXCEPTION 'RETURN_REFUND_INVALID';
    END IF;
    IF p_refund_amount > COALESCE(refundable, 0) THEN RAISE EXCEPTION 'RETURN_REFUND_EXCEEDS'; END IF;
    INSERT INTO document_sequences (company_id, document_type, period, next_value)
    VALUES (p_company, 'payment', to_char(now(), 'YYYY'), 2)
    ON CONFLICT (company_id, document_type, period) DO UPDATE SET next_value = document_sequences.next_value + 1
    RETURNING next_value - 1 INTO pseq;
    pnum := 'PAY-' || to_char(now(), 'YYYY') || '-' || lpad(pseq::text, 5, '0');
    pid := gen_random_uuid();
    INSERT INTO payments (id, company_id, payment_number, direction, party_type, customer_id, amount, method_id, status, reference, note, created_by)
    VALUES (pid, p_company, pnum, 'out', CASE WHEN s.customer_id IS NULL THEN 'other' ELSE 'customer' END, s.customer_id,
            p_refund_amount, p_refund_method, 'posted', rnum, 'Remboursement du retour ' || rnum, p_user);
    INSERT INTO payment_allocations (company_id, payment_id, document_type, document_id, allocated_amount)
    VALUES (p_company, pid, 'sales_return', rid, p_refund_amount);
    refunded := p_refund_amount;
  END IF;

  RETURN jsonb_build_object('id', rid, 'number', rnum, 'total', total, 'refunded', refunded,
                            'refundableLeft', GREATEST(COALESCE(refundable, 0) - refunded, 0),
                            'paymentNumber', pnum);
END
$$;

-- Droits : le directeur peut enregistrer des retours et des remboursements (le vendeur peut déjà enregistrer un retour).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('sales.return', 'sales.refund')
WHERE r.is_system AND r.name = 'Directeur'
ON CONFLICT DO NOTHING;
