-- 0019 : notifications internes et alertes de stock (cahier des charges 3.9, 7.9).
-- - notify_users : crée une notification pour chaque utilisateur actif de l'entreprise qui possède une permission donnée.
--   Une notification non lue identique (même clé) n'est jamais dupliquée.
-- - Déclencheur de stock : alerte « stock bas » (passage sous le seuil) et « rupture » (passage à zéro) ;
--   les alertes se marquent lues d'elles-mêmes quand le stock remonte au-dessus du seuil.
--   Une erreur de notification n'annule JAMAIS la vente ou la réception qui l'a provoquée.
-- Les canaux externes (e-mail, SMS, WhatsApp) passeront par notification_deliveries / outbox_events (0010).
-- Additive, idempotente.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx ON notifications (company_id, user_id, dedupe_key) WHERE read_at IS NULL AND dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION notify_users(
  p_company uuid, p_permission text, p_type text, p_title text, p_body text, p_link text, p_severity text, p_dedupe text
) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  n int;
BEGIN
  INSERT INTO notifications (company_id, user_id, type, payload, dedupe_key)
  SELECT p_company, m.user_id, p_type,
         jsonb_build_object('title', p_title, 'body', p_body, 'link', p_link, 'severity', p_severity), p_dedupe
  FROM company_memberships m
  JOIN users u ON u.id = m.user_id AND u.active
  WHERE m.company_id = p_company AND m.status = 'active'
    AND EXISTS (
      SELECT 1 FROM membership_roles mr
      JOIN role_permissions rp ON rp.role_id = mr.role_id
      JOIN permissions pe ON pe.id = rp.permission_id
      WHERE mr.membership_id = m.id AND pe.code = p_permission
    )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;

CREATE OR REPLACE FUNCTION notify_stock_levels() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    IF NEW.quantity <= 0 AND OLD.quantity > 0 THEN
      PERFORM notify_users(NEW.company_id, 'products.update', 'stock_out', 'Rupture de stock',
        NEW.name || ' (' || NEW.sku || ') est en rupture.', '/produits', 'danger', 'stock:' || NEW.id || ':out');
    ELSIF NEW.quantity > 0 AND NEW.quantity <= NEW.min_quantity AND OLD.quantity > NEW.min_quantity THEN
      PERFORM notify_users(NEW.company_id, 'products.update', 'stock_low', 'Stock bas',
        NEW.name || ' (' || NEW.sku || ') : ' || NEW.quantity || ' en stock, seuil d''alerte ' || NEW.min_quantity || '.', '/produits', 'warning', 'stock:' || NEW.id || ':low');
    END IF;
    IF NEW.quantity > NEW.min_quantity AND OLD.quantity <= OLD.min_quantity THEN
      UPDATE notifications SET read_at = now()
       WHERE company_id = NEW.company_id AND read_at IS NULL AND dedupe_key IN ('stock:' || NEW.id || ':low', 'stock:' || NEW.id || ':out');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- une alerte ne doit jamais bloquer une opération de stock
  END;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS products_notify_stock ON products;
CREATE TRIGGER products_notify_stock AFTER UPDATE OF quantity ON products
  FOR EACH ROW WHEN (NEW.quantity IS DISTINCT FROM OLD.quantity) EXECUTE FUNCTION notify_stock_levels();
