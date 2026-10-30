-- 0018 : valorisation CUMP, marges, dépenses et trésorerie (cahier des charges 3.8, 7.8).
-- CUMP = coût unitaire moyen pondéré : à chaque réception d'achat, nouveau coût moyen =
--   (stock avant × coût moyen + quantité reçue × coût d'achat) / (stock avant + quantité reçue).
-- Chaque ligne de vente conserve le coût moyen du moment (sale_items.unit_cost) : les marges passées ne changent plus.
-- Les ventes antérieures n'ont pas de coût connu (NULL) : elles sont exclues du calcul de marge, jamais comptées à zéro.
-- Trésorerie : comptes (caisse, mobile money, banque) rattachés aux modes de paiement ; solde = solde d'ouverture
-- + encaissements validés - règlements validés. Dépenses : en attente -> payée (approbation) ou rejetée ; annuler une
-- dépense payée contrepasse son paiement. Additive, idempotente.

ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_cost numeric(19,4) NOT NULL DEFAULT 0 CHECK (avg_cost >= 0);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_cost numeric(19,4) CHECK (unit_cost IS NULL OR unit_cost >= 0);

CREATE TABLE IF NOT EXISTS cash_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  type text NOT NULL CHECK (type IN ('cash', 'mobile_money', 'bank')),
  opening_balance numeric(19,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  UNIQUE (id, company_id),
  UNIQUE (company_id, name)
);

INSERT INTO cash_accounts (company_id, name, type)
SELECT c.id, v.name, v.type FROM companies c
CROSS JOIN (VALUES ('Caisse principale', 'cash'), ('Orange Money', 'mobile_money'), ('MTN Mobile Money', 'mobile_money'), ('Banque', 'bank')) AS v(name, type)
ON CONFLICT (company_id, name) DO NOTHING;

ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS account_id uuid;
UPDATE payment_methods m SET account_id = a.id
FROM cash_accounts a
WHERE a.company_id = m.company_id AND m.account_id IS NULL
  AND a.name = CASE m.code WHEN 'cash' THEN 'Caisse principale' WHEN 'orange_money' THEN 'Orange Money' WHEN 'mtn_money' THEN 'MTN Mobile Money' ELSE 'Banque' END;
ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS payment_methods_account_fk;
ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_account_fk FOREIGN KEY (account_id, company_id) REFERENCES cash_accounts(id, company_id);

CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  UNIQUE (id, company_id),
  UNIQUE (company_id, name)
);

INSERT INTO expense_categories (company_id, name)
SELECT c.id, v.name FROM companies c
CROSS JOIN (VALUES ('Loyer'), ('Salaires'), ('Transport'), ('Électricité et eau'), ('Internet et téléphone'), ('Fournitures'), ('Marketing'), ('Entretien et réparations'), ('Taxes et impôts'), ('Autres')) AS v(name)
ON CONFLICT (company_id, name) DO NOTHING;

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  expense_number text NOT NULL,
  category_id uuid NOT NULL,
  amount numeric(19,4) NOT NULL CHECK (amount > 0),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  method_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected', 'cancelled')),
  payment_id uuid,
  created_by bigint REFERENCES users(id),
  approved_by bigint REFERENCES users(id),
  approved_at timestamptz,
  closed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, company_id),
  UNIQUE (company_id, expense_number),
  FOREIGN KEY (category_id, company_id) REFERENCES expense_categories(id, company_id),
  FOREIGN KEY (method_id, company_id) REFERENCES payment_methods(id, company_id),
  FOREIGN KEY (payment_id, company_id) REFERENCES payments(id, company_id)
);
CREATE INDEX IF NOT EXISTS expenses_list_idx ON expenses (company_id, expense_date DESC);

CREATE OR REPLACE VIEW account_balances AS
SELECT a.company_id, a.id AS account_id, a.name, a.type, a.status, a.opening_balance,
       COALESCE(x.inflow, 0) AS inflow, COALESCE(x.outflow, 0) AS outflow,
       a.opening_balance + COALESCE(x.inflow, 0) - COALESCE(x.outflow, 0) AS balance
FROM cash_accounts a
LEFT JOIN LATERAL (
  SELECT SUM(p.amount) FILTER (WHERE p.direction = 'in') AS inflow, SUM(p.amount) FILTER (WHERE p.direction = 'out') AS outflow
  FROM payments p JOIN payment_methods m ON m.id = p.method_id AND m.company_id = p.company_id
  WHERE m.account_id = a.id AND m.company_id = a.company_id AND p.status = 'posted'
) x ON TRUE;

-- Les nouvelles entreprises reçoivent comptes, modes de paiement et catégories de dépenses par défaut.
CREATE OR REPLACE FUNCTION seed_company_finance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO cash_accounts (company_id, name, type) VALUES
    (NEW.id, 'Caisse principale', 'cash'), (NEW.id, 'Orange Money', 'mobile_money'),
    (NEW.id, 'MTN Mobile Money', 'mobile_money'), (NEW.id, 'Banque', 'bank')
  ON CONFLICT (company_id, name) DO NOTHING;
  INSERT INTO payment_methods (company_id, code, name, type, account_id)
  SELECT NEW.id, v.code, v.name, v.type, a.id
  FROM (VALUES ('cash', 'Espèces', 'cash', 'Caisse principale'), ('orange_money', 'Orange Money', 'mobile_money', 'Orange Money'),
               ('mtn_money', 'MTN Mobile Money', 'mobile_money', 'MTN Mobile Money'), ('card', 'Carte bancaire', 'card', 'Banque'),
               ('bank_transfer', 'Virement bancaire', 'bank', 'Banque')) AS v(code, name, type, account)
  JOIN cash_accounts a ON a.company_id = NEW.id AND a.name = v.account
  ON CONFLICT (company_id, code) DO NOTHING;
  INSERT INTO expense_categories (company_id, name)
  SELECT NEW.id, v.name FROM (VALUES ('Loyer'), ('Salaires'), ('Transport'), ('Électricité et eau'), ('Internet et téléphone'),
    ('Fournitures'), ('Marketing'), ('Entretien et réparations'), ('Taxes et impôts'), ('Autres')) AS v(name)
  ON CONFLICT (company_id, name) DO NOTHING;
  RETURN NULL;
END
$$;
DROP TRIGGER IF EXISTS companies_seed_payment_methods ON companies;
DROP TRIGGER IF EXISTS companies_seed_finance ON companies;
CREATE TRIGGER companies_seed_finance AFTER INSERT ON companies FOR EACH ROW EXECUTE FUNCTION seed_company_finance();

-- Réception d'achat avec calcul du CUMP (remplace la version de 0013).
CREATE OR REPLACE FUNCTION receive_purchase(p_company uuid, p_order bigint, p_user bigint, p_lines jsonb, p_note text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  o purchase_orders%ROWTYPE;
  x RECORD;
  it purchase_order_items%ROWTYPE;
  pr products%ROWTYPE;
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
      SELECT * INTO pr FROM products WHERE id = it.product_id AND company_id = p_company FOR UPDATE;
      UPDATE products
         SET quantity = quantity + x.rec,
             avg_cost = CASE WHEN pr.quantity <= 0 OR pr.avg_cost = 0 THEN it.unit_cost
                             ELSE round((pr.quantity * pr.avg_cost + x.rec * it.unit_cost) / (pr.quantity + x.rec), 4) END,
             updated_at = now()
       WHERE id = it.product_id AND company_id = p_company;
      INSERT INTO stock_movements (company_id, product_id, movement_type, quantity, note, user_id, supplier_id, source_type, source_id, unit_cost)
      VALUES (p_company, it.product_id, 'in', x.rec, 'Réception ' || rnum || ' (commande #' || p_order || ')', p_user, o.supplier_id, 'goods_receipt', rid::text, it.unit_cost);
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

-- Approuve une dépense en attente : crée le règlement (sortie de trésorerie) et marque la dépense payée.
CREATE OR REPLACE FUNCTION approve_expense(p_company uuid, p_expense uuid, p_user bigint) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  e expenses%ROWTYPE;
  pay jsonb;
BEGIN
  SELECT * INTO e FROM expenses WHERE id = p_expense AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXPENSE_NOT_FOUND'; END IF;
  IF e.status <> 'pending' THEN RAISE EXCEPTION 'EXPENSE_BAD_STATUS'; END IF;
  pay := record_payment(p_company, p_user, 'out', NULL, NULL, e.amount, e.method_id, e.expense_number, e.description, '[]'::jsonb);
  UPDATE expenses SET status = 'paid', payment_id = (pay->>'id')::uuid, approved_by = p_user, approved_at = now() WHERE id = p_expense;
  RETURN jsonb_build_object('id', p_expense, 'number', e.expense_number, 'paymentNumber', pay->>'number');
END
$$;

-- Crée une dépense (numérotée côté serveur) ; p_approve = TRUE : approuvée et payée dans la même transaction.
CREATE OR REPLACE FUNCTION create_expense(p_company uuid, p_user bigint, p_category uuid, p_amount numeric, p_description text,
                                          p_date date, p_method uuid, p_approve boolean) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  eid uuid := gen_random_uuid();
  seq bigint;
  enum text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'EXPENSE_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = p_category AND company_id = p_company AND status = 'active') THEN RAISE EXCEPTION 'EXPENSE_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = p_method AND company_id = p_company AND status = 'active') THEN RAISE EXCEPTION 'PAYMENT_METHOD_INVALID'; END IF;
  INSERT INTO document_sequences (company_id, document_type, period, next_value)
  VALUES (p_company, 'expense', to_char(now(), 'YYYY'), 2)
  ON CONFLICT (company_id, document_type, period) DO UPDATE SET next_value = document_sequences.next_value + 1
  RETURNING next_value - 1 INTO seq;
  enum := 'DEP-' || to_char(now(), 'YYYY') || '-' || lpad(seq::text, 5, '0');
  INSERT INTO expenses (id, company_id, expense_number, category_id, amount, description, expense_date, method_id, created_by)
  VALUES (eid, p_company, enum, p_category, p_amount, btrim(p_description), COALESCE(p_date, CURRENT_DATE), p_method, p_user);
  IF p_approve THEN
    PERFORM approve_expense(p_company, eid, p_user);
  END IF;
  RETURN jsonb_build_object('id', eid, 'number', enum, 'status', CASE WHEN p_approve THEN 'paid' ELSE 'pending' END);
END
$$;

CREATE OR REPLACE FUNCTION close_expense(p_company uuid, p_expense uuid, p_user bigint, p_reason text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  e expenses%ROWTYPE;
BEGIN
  SELECT * INTO e FROM expenses WHERE id = p_expense AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXPENSE_NOT_FOUND'; END IF;
  IF e.status = 'pending' THEN
    UPDATE expenses SET status = 'rejected', closed_reason = p_reason WHERE id = p_expense;
    RETURN 'rejected';
  ELSIF e.status = 'paid' THEN
    PERFORM reverse_payment(p_company, e.payment_id, p_user, 'Annulation de la dépense ' || e.expense_number || ' : ' || p_reason);
    UPDATE expenses SET status = 'cancelled', closed_reason = p_reason WHERE id = p_expense;
    RETURN 'cancelled';
  END IF;
  RAISE EXCEPTION 'EXPENSE_BAD_STATUS';
END
$$;

-- Droits : le directeur peut saisir des dépenses (il peut déjà les approuver).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'expenses.create'
WHERE r.is_system AND r.name = 'Directeur'
ON CONFLICT DO NOTHING;
