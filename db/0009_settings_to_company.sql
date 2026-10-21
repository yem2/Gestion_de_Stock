-- Gestion de Stock: les paramètres deviennent propres à chaque entreprise (companies.settings, jsonb).
-- À exécuter après 0005. Recopie les anciens paramètres de la table settings dans l'entreprise par défaut.
-- La table settings est conservée (ne plus l'utiliser) ; elle pourra être supprimée plus tard.
UPDATE companies
SET settings = settings || COALESCE((SELECT jsonb_object_agg(key, value) FROM settings), '{}'::jsonb),
    updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';
