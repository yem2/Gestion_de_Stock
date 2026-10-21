-- Gestion de Stock: retire les valeurs par défaut transitoires de company_id.
-- À exécuter UNIQUEMENT après le déploiement du code qui fournit company_id à chaque insertion.
-- Ensuite, tout oubli de company_id provoque une erreur au lieu d'écrire silencieusement dans l'entreprise par défaut.
ALTER TABLE products ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE suppliers ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE customers ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE purchase_orders ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE sales ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE stock_movements ALTER COLUMN company_id DROP DEFAULT;
