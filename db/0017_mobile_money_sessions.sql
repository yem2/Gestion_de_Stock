-- 0017 : paiements Orange Money et MTN MoMo.
-- Une session suit chaque demande auprès de l'opérateur (référence, jeton de notification, lien de paiement, dernier statut).
-- Le paiement lui-même reste dans `payments` (statut pending -> posted / failed) : voir record_payment et settle_pending_payment (0016).
-- Additive, idempotente.
CREATE TABLE IF NOT EXISTS payment_provider_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  payment_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('orange_money', 'mtn_money')),
  external_id text NOT NULL,
  phone text,
  pay_token text,
  notif_token text,
  payment_url text,
  last_status text NOT NULL DEFAULT 'initiated' CHECK (last_status IN ('initiated', 'pending', 'success', 'failed', 'expired')),
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id),
  UNIQUE (payment_id),
  FOREIGN KEY (payment_id, company_id) REFERENCES payments(id, company_id)
);
CREATE INDEX IF NOT EXISTS payment_provider_sessions_open_idx ON payment_provider_sessions (created_at) WHERE last_status IN ('initiated', 'pending');
CREATE INDEX IF NOT EXISTS payment_provider_sessions_notif_idx ON payment_provider_sessions (notif_token) WHERE notif_token IS NOT NULL;
