# Gestion de Stock

Application web de gestion commerciale des stocks, en français et en FCFA (XAF). Projet indépendant d'OCTOPLUS.

## Architecture initiale

- Next.js App Router + React + TypeScript
- API Routes côté serveur
- Neon PostgreSQL via `@neondatabase/serverless`
- Tailwind CSS 4 pour la base de style
- Déploiement prévu sur Vercel

> La stack exacte de toutes les dépendances internes d'OCTOPLUS n'a pas pu être vérifiée. Cette base reprend Next.js et l'architecture Vercel/Neon retenue, sans toucher à OCTOPLUS.

## Structure du projet (alignée sur OCTOPLUS)

- `app/` : pages et routes API (App Router)
- `components/` : composants d'interface
- `lib/` : connexion base de données et validation
- `db/` : migrations SQL
- `docs/` : feuille de route et notes de sécurité

Charte graphique : rouge et noir, comme OCTOPLUS.

## Démarrage local

1. Installe Node.js 20.9 ou plus récent.
2. Installe les dépendances : `npm install`
3. Copie `.env.example` vers `.env.local`.
4. Crée une base de données **distincte** dans Neon et place son URL dans `DATABASE_URL`.
5. Exécute le SQL de `db/0000_initial_schema.sql` puis `db/0001_auth.sql` dans le SQL Editor de cette base Neon.
6. Lance `npm run dev`, puis ouvre `http://localhost:3000`.

Sans `DATABASE_URL` et la migration, l'interface s'affiche mais les données et l'ajout de produits ne fonctionnent pas.

## API incluse

- `GET /api/health` : vérification de connexion à Neon.
- `GET /api/products` : liste les produits.
- `POST /api/products` : crée un produit avec validation des données.

## À faire avant la production

- Authentification et sessions sécurisées.
- Autorisations côté serveur pour les rôles admin, manager, magasinier et vendeur.
- Mouvements de stock atomiques et audit des modifications.
- CRUD fournisseurs, clients, ventes, catégories et utilisateurs.
- Tests automatisés, gestion d'erreurs et revue de sécurité.
- Ajouter `DATABASE_URL` dans les variables d'environnement Vercel (Production/Preview/Development selon le besoin).

Ne jamais publier le fichier `.env.local` ni placer des secrets dans GitHub.


## Authentification et rôles

- Variables requises : `DATABASE_URL`, `AUTH_SECRET` (32 caractères minimum) et, pour la première installation, `SETUP_KEY`.
- Premier démarrage : ouvrir `/setup`, saisir `SETUP_KEY` et créer le super administrateur. Cette page se désactive dès qu'un compte existe ; supprimez ensuite `SETUP_KEY`.
- Rôles : super administrateur, administrateur, gestionnaire, magasinier, vendeur. Un administrateur ne gère que les rôles inférieurs au sien.
- Mots de passe hachés (scrypt), sessions signées de 8 h, blocage de 15 minutes après 5 échecs, journal d'audit.
