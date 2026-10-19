# Gestion de Stock

Application web de gestion commerciale des stocks, en français et en FCFA (XAF). Projet indépendant d'OCTOPLUS.

## Architecture

- Next.js 16 (App Router) + React 19 + TypeScript
- API Routes côté serveur
- Neon PostgreSQL via `@neondatabase/serverless`
- Tailwind CSS 4 pour la base de style
- Déploiement sur Vercel

## Structure du projet

- `app/` : pages et routes API (App Router)
- `components/` : interface (tableau de bord, produits, mouvements, fenêtres de saisie)
- `lib/` : base de données, authentification, rôles, requêtes de stock, validation
- `db/` : migrations SQL (à exécuter dans l'ordre)
- `docs/` : feuille de route et notes de sécurité

Charte graphique : rouge et noir, comme OCTOPLUS.

## Démarrage local

1. Installe Node.js 20.9 ou plus récent.
2. Installe les dépendances : `npm install`
3. Copie `.env.example` vers `.env.local` et renseigne les variables.
4. Crée une base de données **distincte** dans Neon et place son URL dans `DATABASE_URL`.
5. Exécute dans le SQL Editor de cette base, **dans l'ordre** : `db/0000_initial_schema.sql`, `db/0001_auth.sql`, `db/0002_stock.sql`.
6. Lance `npm run dev`, puis ouvre `http://localhost:3000`.

Vérifications : `npm run typecheck`, `npm run lint`, `npm run build`.

## Variables d'environnement

- `DATABASE_URL` : base Neon de ce projet.
- `AUTH_SECRET` : 32 caractères minimum (vérifiable sur `/api/health`).
- `SETUP_KEY` : uniquement pour la première installation ; supprime-la ensuite.

## Mise à jour d'une base existante

À chaque nouvelle version, exécute les nouvelles migrations dans Neon avant (ou juste après) le déploiement. La migration `0002_stock.sql` peut être relancée sans risque. Tant qu'elle n'est pas exécutée, l'application affiche « Migration manquante ».

## Authentification et rôles

- Premier démarrage : ouvrir `/setup`, saisir `SETUP_KEY` et créer le super administrateur. La page se désactive dès qu'un compte existe.
- Mots de passe hachés (scrypt), sessions signées de 8 h, blocage du compte 15 minutes après 5 échecs, limitation à 20 échecs par adresse IP sur 15 minutes, journal d'audit.

| Action | Super admin / Admin / Gestionnaire | Magasinier | Vendeur |
|---|---|---|---|
| Voir les produits | oui | oui | oui |
| Créer un produit | oui | oui | non |
| Entrées / sorties de stock | oui | oui | non |
| Ajustement d'inventaire | oui | non | non |
| Modifier / archiver un produit | oui | non | non |
| Voir l'historique des mouvements | oui | oui | non |
| Gérer les utilisateurs (API) | Super admin / Admin (rôles inférieurs) | non | non |

## API

- `GET /api/health` : état de la base et de la configuration d'authentification.
- `GET /api/products` : produits actifs (`?archived=1` : archivés, gestionnaires et au-dessus).
- `POST /api/products` : crée un produit (la quantité initiale crée un mouvement « Stock initial »).
- `PATCH /api/products/:id` : modifie un produit, ou l'archive / restaure (`{ "archived": true }`). La quantité ne se change que par un mouvement.
- `GET /api/movements` : historique (`?productId=`, `?type=in|out|adjustment`, `?limit=`).
- `POST /api/movements` : `{ productId, type, quantity, note? }`. Entrée / sortie : quantité déplacée. Ajustement : nouvelle quantité comptée.
- `GET/POST /api/users`, `PATCH /api/users/:id` : gestion des utilisateurs.

Les mouvements s'exécutent en une seule instruction SQL : le stock ne peut pas devenir négatif et deux sorties simultanées ne se déduisent pas deux fois.

## À faire

Voir `docs/ROADMAP.md`. Ne jamais publier `.env.local` ni placer de secrets dans GitHub.
