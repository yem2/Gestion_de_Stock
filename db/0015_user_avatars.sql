-- 0015 : photo de profil des utilisateurs.
-- L'image (JPEG, PNG ou WebP, redimensionnée en 256×256 côté navigateur) est stockée en base64 dans une table
-- dédiée : elle ne dépend pas du système de fichiers éphémère de Vercel (cahier des charges 8.4) et ne ralentit
-- pas la table users. Additive, idempotente.
CREATE TABLE IF NOT EXISTS user_avatars (
  user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  data_base64 text NOT NULL CHECK (length(data_base64) BETWEEN 100 AND 400000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
