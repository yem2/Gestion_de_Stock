-- 0010 : Phase 03 du cahier des charges (catalogue et stock) + tables transversales.
-- Migration ADDITIVE uniquement : aucune table ni colonne existante n'est modifiée ou supprimée,
-- donc sans risque pour le code déjà en production. Idempotente (peut être rejouée).

-- ---------- Catalogue ----------
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  UNIQUE (company_id, name),
  UNIQUE (id, company_id)
);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  warehouse_id uuid NOT NULL,
  parent_id uuid,
  code text NOT NULL CHECK (length(btrim(code)) > 0),
  name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  UNIQUE (id, company_id),
  UNIQUE (company_id, warehouse_id, code),
  FOREIGN KEY (warehouse_id, company_id) REFERENCES warehouses(id, company_id),
  FOREIGN KEY (parent_id, company_id) REFERENCES locations(id, company_id)
);

CREATE TABLE IF NOT EXISTS product_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  product_id bigint NOT NULL,
  barcode text NOT NULL CHECK (length(btrim(barcode)) > 0),
  unit_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, barcode),
  FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id),
  FOREIGN KEY (unit_id, company_id) REFERENCES units(id, company_id)
);
CREATE INDEX IF NOT EXISTS product_barcodes_product_idx ON product_barcodes (company_id, product_id);

CREATE TABLE IF NOT EXISTS product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  product_id bigint NOT NULL,
  price_type text NOT NULL CHECK (price_type IN ('sale','purchase')),
  amount numeric(19,4) NOT NULL CHECK (amount >= 0),
  valid_from timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES users(id),
  FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id)
);
CREATE INDEX IF NOT EXISTS product_prices_lookup_idx ON product_prices (company_id, product_id, price_type, valid_from DESC);

-- ---------- Transferts entre entrepôts ----------
CREATE TABLE IF NOT EXISTS stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  transfer_number text NOT NULL,
  source_warehouse_id uuid NOT NULL,
  destination_warehouse_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','shipped','received','cancelled')),
  note text,
  created_by bigint REFERENCES users(id),
  shipped_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_warehouse_id <> destination_warehouse_id),
  UNIQUE (id, company_id),
  UNIQUE (company_id, transfer_number),
  FOREIGN KEY (source_warehouse_id, company_id) REFERENCES warehouses(id, company_id),
  FOREIGN KEY (destination_warehouse_id, company_id) REFERENCES warehouses(id, company_id)
);

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  transfer_id uuid NOT NULL,
  product_id bigint NOT NULL,
  quantity_requested numeric(19,4) NOT NULL CHECK (quantity_requested > 0),
  quantity_shipped numeric(19,4) NOT NULL DEFAULT 0 CHECK (quantity_shipped >= 0),
  quantity_received numeric(19,4) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  CHECK (quantity_received <= quantity_shipped),
  FOREIGN KEY (transfer_id, company_id) REFERENCES stock_transfers(id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id)
);
CREATE INDEX IF NOT EXISTS stock_transfer_lines_transfer_idx ON stock_transfer_lines (transfer_id);

-- ---------- Inventaires physiques ----------
CREATE TABLE IF NOT EXISTS inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  count_number text NOT NULL,
  warehouse_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','submitted','approved','cancelled')),
  created_by bigint REFERENCES users(id),
  approved_by bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  UNIQUE (id, company_id),
  UNIQUE (company_id, count_number),
  FOREIGN KEY (warehouse_id, company_id) REFERENCES warehouses(id, company_id)
);

CREATE TABLE IF NOT EXISTS inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  count_id uuid NOT NULL,
  product_id bigint NOT NULL,
  expected_quantity numeric(19,4) NOT NULL CHECK (expected_quantity >= 0),
  counted_quantity numeric(19,4) CHECK (counted_quantity >= 0),
  UNIQUE (count_id, product_id),
  FOREIGN KEY (count_id, company_id) REFERENCES inventory_counts(id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id)
);

-- ---------- Réservations ----------
CREATE TABLE IF NOT EXISTS stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  product_id bigint NOT NULL,
  warehouse_id uuid NOT NULL,
  document_type text NOT NULL,
  document_id text NOT NULL,
  quantity numeric(19,4) NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','consumed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id),
  FOREIGN KEY (warehouse_id, company_id) REFERENCES warehouses(id, company_id)
);
CREATE INDEX IF NOT EXISTS stock_reservations_active_idx ON stock_reservations (company_id, product_id, warehouse_id) WHERE status = 'active';

-- ---------- Transversal : numérotation, idempotence, outbox, notifications ----------
CREATE TABLE IF NOT EXISTS document_sequences (
  company_id uuid NOT NULL REFERENCES companies(id),
  document_type text NOT NULL,
  period text NOT NULL DEFAULT '',
  next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
  PRIMARY KEY (company_id, document_type, period)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  company_id uuid NOT NULL REFERENCES companies(id),
  key text NOT NULL CHECK (length(key) BETWEEN 8 AND 200),
  operation text NOT NULL,
  result_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, key, operation)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox_events (next_attempt_at) WHERE status IN ('pending','failed');

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id bigint REFERENCES users(id),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, company_id)
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (company_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  notification_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','email','sms','whatsapp')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  FOREIGN KEY (notification_id, company_id) REFERENCES notifications(id, company_id) ON DELETE CASCADE
);

-- ---------- Catalogue complet des permissions (section 4.2) ----------
INSERT INTO permissions (code, description) VALUES
 ('products.read','Consulter les produits'),('products.create','Créer des produits'),('products.update','Modifier des produits'),('products.archive','Archiver des produits'),
 ('inventory.read','Consulter les stocks'),('inventory.adjust','Ajuster le stock'),('inventory.transfer.create','Créer un transfert'),
 ('inventory.transfer.ship','Expédier un transfert'),('inventory.transfer.receive','Réceptionner un transfert'),
 ('inventory.count','Compter un inventaire'),('inventory.count.approve','Approuver un inventaire'),
 ('purchases.create','Créer une commande d''achat'),('purchases.submit','Soumettre une commande'),('purchases.approve','Approuver une commande'),
 ('purchases.receive','Réceptionner une commande'),('purchases.cancel','Annuler une commande'),
 ('sales.create','Créer une vente'),('sales.validate','Valider une vente'),('sales.discount.override','Accorder des remises hors règle'),
 ('sales.return','Enregistrer un retour client'),('sales.refund','Rembourser un client'),
 ('payments.record','Enregistrer un paiement'),('payments.reverse','Contrepasser un paiement'),
 ('expenses.create','Créer une dépense'),('expenses.approve','Approuver une dépense'),
 ('reports.stock.read','Consulter les rapports de stock'),('reports.finance.read','Consulter les rapports financiers'),
 ('users.manage','Gérer les utilisateurs'),('roles.manage','Gérer les rôles'),('audit.read','Consulter le journal d''audit')
ON CONFLICT (code) DO NOTHING;

-- Rôles système : l'administrateur d'entreprise reçoit tout ; les autres rôles reçoivent leur périmètre.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  (r.name = 'Administrateur entreprise')
  OR (r.name = 'Directeur' AND p.code IN ('products.read','inventory.read','purchases.approve','sales.validate','sales.discount.override','payments.reverse','expenses.approve','inventory.count.approve','reports.stock.read','reports.finance.read','audit.read'))
  OR (r.name = 'Gestionnaire de stock' AND (p.code LIKE 'products.%' OR p.code LIKE 'inventory.%' OR p.code = 'reports.stock.read'))
  OR (r.name = 'Responsable achats' AND (p.code LIKE 'purchases.%' OR p.code IN ('products.read','inventory.read')))
  OR (r.name = 'Vendeur / Caissier' AND p.code IN ('products.read','inventory.read','sales.create','sales.validate','payments.record'))
  OR (r.name = 'Comptable' AND p.code IN ('payments.record','payments.reverse','expenses.create','expenses.approve','reports.finance.read','products.read'))
  OR (r.name = 'Auditeur' AND p.code IN ('products.read','inventory.read','reports.stock.read','reports.finance.read','audit.read'))
) WHERE r.is_system
ON CONFLICT DO NOTHING;
