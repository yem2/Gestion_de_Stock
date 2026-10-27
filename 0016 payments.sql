-- 0016 : module Paiements (cahier des charges 3.8, 5.2 Finance, 7.6).
-- Modes de paiement par entreprise, paiements (encaissements et règlements), affectations aux documents,
-- plafond de crédit client, soldes calculés depuis les paiements sources (vues sale_balances / purchase_balances).
-- Un paiement validé n'est jamais supprimé : il est contrepassé (statut reversed).
-- Idempotente.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit numeric(19,4) CHECK (credit_limit IS NULL OR credit_limit >= 0);

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL CHECK (code ~ '^[a-z0-9_]{2,30}$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  type text NOT NULL CHECK (type IN ('cash','mobile_money','card','bank','other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  UNIQUE (id, company_id),
  UNIQUE (company_id, code)
);

INSERT INTO payment_methods (company_id, code, name, type)
SELECT c.id, v.code, v.name, v.type
FROM companies c
CROSS JOIN (VALUES
  ('cash', 'Espèces', 'cash'),
  ('orange_money', 'Orange Money', 'mobile_money'),
  ('mtn_money', 'MTN Mobile Money', 'mobile_money'),
  ('card', 'Carte bancaire', 'card'),
  ('bank_transfer', 'Virement bancaire', 'bank')
) AS v(code, name, type)
ON CONFLICT (company_id, code) DO NOTHING;

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  payment_number text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  party_type text NOT NULL DEFAULT 'other' CHECK (party_type IN ('customer','supplier','other')),
  customer_id bigint,
  supplier_id bigint,
  amount numeric(19,4) NOT NULL CHECK (amount > 0),
  method_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('pending','posted','failed','reversed')),
  reference text,
  provider text,
  provider_reference text,
  note text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by bigint REFERENCES users(id),
  reversal_reason text,
  CHECK (customer_id IS NULL OR supplier_id IS NULL),
  CHECK (party_type <> 'customer' OR customer_id IS NOT NULL),
  CHECK (party_type <> 'supplier' OR supplier_id IS NOT NULL),
  UNIQUE (id, company_id),
  UNIQUE (company_id, payment_number),
  FOREIGN KEY (customer_id, company_id) REFERENCES customers(id, company_id),
  FOREIGN KEY (supplier_id, company_id) REFERENCES suppliers(id, company_id),
  FOREIGN KEY (method_id, company_id) REFERENCES payment_methods(id, company_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_idx ON payments (company_id, provider, provider_reference) WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_list_idx ON payments (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments (company_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_supplier_idx ON payments (company_id, supplier_id) WHERE supplier_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  payment_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('sale','purchase_order')),
  document_id bigint NOT NULL,
  allocated_amount numeric(19,4) NOT NULL CHECK (allocated_amount > 0),
  UNIQUE (payment_id, document_type, document_id),
  FOREIGN KEY (payment_id, company_id) REFERENCES payments(id, company_id)
);
CREATE INDEX IF NOT EXISTS payment_allocations_doc_idx ON payment_allocations (company_id, document_type, document_id);

-- Reprise de l'existant : chaque vente terminée a été réglée au comptoir, avec son mode de paiement.
INSERT INTO payments (company_id, payment_number, direction, party_type, customer_id, amount, method_id, status, paid_at, created_by)
SELECT s.company_id, 'PAY-LEG-' || s.id, 'in', CASE WHEN s.customer_id IS NULL THEN 'other' ELSE 'customer' END, s.customer_id,
       s.total_amount, m.id, 'posted', s.created_at, s.user_id
FROM sales s
JOIN payment_methods m ON m.company_id = s.company_id AND m.code = s.payment_method
WHERE s.status = 'completed' AND s.total_amount > 0
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.company_id = s.company_id AND p.payment_number = 'PAY-LEG-' || s.id);

INSERT INTO payment_allocations (company_id, payment_id, document_type, document_id, allocated_amount)
SELECT p.company_id, p.id, 'sale', substring(p.payment_number from 9)::bigint, p.amount
FROM payments p
WHERE p.payment_number LIKE 'PAY-LEG-%'
ON CONFLICT (payment_id, document_type, document_id) DO NOTHING;

-- Soldes calculés depuis les paiements sources (paid = validés ; pending = en attente de confirmation).
CREATE OR REPLACE VIEW sale_balances AS
SELECT s.company_id, s.id AS sale_id, s.customer_id, s.status, s.created_at, s.total_amount AS total,
       COALESCE(x.paid, 0) AS paid, COALESCE(x.pending, 0) AS pending, s.total_amount - COALESCE(x.paid, 0) AS due
FROM sales s
LEFT JOIN LATERAL (
  SELECT SUM(a.allocated_amount) FILTER (WHERE p.status = 'posted') AS paid,
         SUM(a.allocated_amount) FILTER (WHERE p.status = 'pending') AS pending
  FROM payment_allocations a
  JOIN payments p ON p.id = a.payment_id AND p.company_id = a.company_id
  WHERE a.company_id = s.company_id AND a.document_type = 'sale' AND a.document_id = s.id
) x ON TRUE;

CREATE OR REPLACE VIEW purchase_balances AS
SELECT o.company_id, o.id AS order_id, o.supplier_id, o.status, o.created_at, o.total_cost AS total,
       COALESCE(x.paid, 0) AS paid, COALESCE(x.pending, 0) AS pending, o.total_cost - COALESCE(x.paid, 0) AS due
FROM purchase_orders o
LEFT JOIN LATERAL (
  SELECT SUM(a.allocated_amount) FILTER (WHERE p.status = 'posted') AS paid,
         SUM(a.allocated_amount) FILTER (WHERE p.status = 'pending') AS pending
  FROM payment_allocations a
  JOIN payments p ON p.id = a.payment_id AND p.company_id = a.company_id
  WHERE a.company_id = o.company_id AND a.document_type = 'purchase_order' AND a.document_id = o.id
) x ON TRUE;

-- Les nouvelles entreprises reçoivent les modes de paiement par défaut.
CREATE OR REPLACE FUNCTION seed_payment_methods() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO payment_methods (company_id, code, name, type) VALUES
    (NEW.id, 'cash', 'Espèces', 'cash'),
    (NEW.id, 'orange_money', 'Orange Money', 'mobile_money'),
    (NEW.id, 'mtn_money', 'MTN Mobile Money', 'mobile_money'),
    (NEW.id, 'card', 'Carte bancaire', 'card'),
    (NEW.id, 'bank_transfer', 'Virement bancaire', 'bank')
  ON CONFLICT (company_id, code) DO NOTHING;
  RETURN NULL;
END
$$;
DROP TRIGGER IF EXISTS companies_seed_payment_methods ON companies;
CREATE TRIGGER companies_seed_payment_methods AFTER INSERT ON companies FOR EACH ROW EXECUTE FUNCTION seed_payment_methods();

-- Enregistre un paiement et l'affecte à des documents, en une seule transaction.
-- p_allocations = [{"documentType":"sale"|"purchase_order","documentId":123,"amount":456}, ...] (peut être vide :
-- le paiement non affecté est conservé séparément, 7.6). p_status : 'posted' (défaut) ou 'pending' (opérateur mobile).
-- Retourne {"id":…, "number":…, "allocated":…}.
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
      SELECT total_amount, customer_id, (status = 'completed') INTO doc_total, doc_party, doc_open
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

-- Contrepasse un paiement validé (jamais de suppression, 7.6).
CREATE OR REPLACE FUNCTION reverse_payment(p_company uuid, p_payment uuid, p_user bigint, p_reason text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  pay payments%ROWTYPE;
BEGIN
  SELECT * INTO pay FROM payments WHERE id = p_payment AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  IF pay.status <> 'posted' THEN RAISE EXCEPTION 'PAYMENT_BAD_STATUS'; END IF;
  UPDATE payments SET status = 'reversed', reversed_at = now(), reversed_by = p_user, reversal_reason = p_reason WHERE id = p_payment;
END
$$;

-- Confirme ou échoue un paiement en attente (retour de l'opérateur de paiement).
CREATE OR REPLACE FUNCTION settle_pending_payment(p_company uuid, p_payment uuid, p_success boolean, p_provider_reference text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  pay payments%ROWTYPE;
BEGIN
  SELECT * INTO pay FROM payments WHERE id = p_payment AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  IF pay.status <> 'pending' THEN RETURN pay.status; END IF;  -- rejeu d'une notification : sans effet
  UPDATE payments SET status = CASE WHEN p_success THEN 'posted' ELSE 'failed' END,
         provider_reference = COALESCE(p_provider_reference, provider_reference), paid_at = now()
   WHERE id = p_payment;
  RETURN CASE WHEN p_success THEN 'posted' ELSE 'failed' END;
END
$$;
