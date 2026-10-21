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
5. Exécute le SQL de `db/0000_initial_schema.sql`, `db/0001_auth.sql` puis `db/0002_modules.sql`, `db/0003_password_reset.sql` puis `db/0004_purchases_settings.sql` dans le SQL Editor de cette base Neon, puis les migrations multi-entreprises décrites plus bas (0005 à 0009).
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


## Modules

- **Tableau de bord** : indicateurs de stock et de ventes, graphique sur 7 jours, produits à réapprovisionner, derniers mouvements.
- **Produits** : catalogue, recherche, filtre stock bas, création, modification, archivage (l'historique est conservé).
- **Mouvements** : entrées (avec fournisseur), sorties et inventaires ; chaque mouvement modifie le stock et s'enregistre dans une seule requête SQL atomique.
- **Ventes** : prix lus en base, stock verrouillé puis décrémenté, paiements espèces / Orange Money / MTN Money / carte bancaire, reçu imprimable, annulation avec remise en stock.
- **Clients** et **Fournisseurs** : fichiers de contacts.
- **Rapports** : chiffre d'affaires sur 7, 30 ou 90 jours, modes de paiement, produits les plus vendus, exports CSV (Excel) et impression.
- **Utilisateurs** : création, rôle, activation, réinitialisation du mot de passe.

L'interface s'adapte aux téléphones, tablettes et ordinateurs : menu latéral sur grand écran, menu coulissant sur mobile, tableaux transformés en cartes sur petit écran.


## Mot de passe oublié

- Sur `/login`, le lien « Mot de passe oublié ? » ouvre `/forgot-password`. La réponse est toujours la même, que l'e-mail existe ou non, et une limite de 3 demandes par heure s'applique.
- **Avec e-mails** (`RESEND_API_KEY` et `MAIL_FROM` définis) : un lien valable 1 h est envoyé à l'utilisateur. Si l'envoi échoue, la demande passe en file d'attente administrateur.
- **Sans e-mails** : la demande apparaît en haut de la page Utilisateurs ; l'administrateur génère un lien à usage unique (1 h) et le remet à l'utilisateur. Un administrateur ne traite que les rôles inférieurs au sien.
- **Récupération du propriétaire** (`RECOVERY_KEY`) : sur `/forgot-password`, « J'ai une clé de récupération » donne immédiatement un lien avec l'e-mail du compte et la clé. Sans `RECOVERY_KEY`, cette voie est désactivée ; après 8 échecs en 15 minutes elle se bloque.
- Les liens sont stockés sous forme d'empreinte, ne servent qu'une fois, et un changement de mot de passe ferme toutes les sessions ouvertes. Migration à exécuter : `db/0003_password_reset.sql`.


## Achats, journal et paramètres

- **Achats** : commandes aux fournisseurs (articles, quantités, coût unitaire). « Réceptionner » passe la commande à *reçue*, augmente le stock et trace les entrées dans la même requête SQL ; une commande ne peut être reçue qu'une fois. Annulation possible tant qu'elle n'est pas reçue.
- **Journal d'activité** (administrateurs) : les 300 dernières actions (connexions, produits, ventes, achats, exports, paramètres…) avec filtre.
- **Paramètres** : changement de son propre mot de passe (ancien mot de passe exigé, autres sessions fermées) et informations de l'entreprise (nom, adresse, téléphone, message) reprises sur les reçus de vente.


## Multi-entreprises (cahier des charges, phases 02 et 03)

Chaque donnée métier appartient à une entreprise (`company_id`). La session contient l'entreprise active (`companyId`) et **toutes les requêtes l'utilisent** : ne jamais lire `company_id` depuis le navigateur.

Ordre d'application sur la base (idéalement d'abord sur une branche Neon de test) :

1. `db/0005_multi_company_rbac.sql` : entreprises, rôles, permissions, appartenances, `company_id` et contraintes inter-entreprises.
2. `db/0006_warehouses_balances.sql` : entrepôts, unités, catégories, `stock_balances`.
3. `db/0007_sync_triggers.sql` : synchronise `stock_balances` avec `products.quantity` (entrepôt par défaut).
4. `db/0009_settings_to_company.sql` : paramètres propres à chaque entreprise.
5. Déployer ce code, puis exécuter `db/0008_drop_transitional_defaults.sql` (retire le `company_id` par défaut transitoire).

Vérification : `DATABASE_URL=... node scripts/check-isolation.mjs` (sur une branche de test uniquement).

Connexions et performances : les requêtes passent par le pilote HTTP Neon (aucune connexion persistante). Utiliser l'URL **pooler** de Neon dans `DATABASE_URL` et placer les fonctions Vercel dans la région la plus proche de la base.

Limites actuelles : un seul entrepôt par entreprise est exploité par l'interface, la session prend la première entreprise active de l'utilisateur, et les permissions restent celles de `lib/roles.ts` (les tables RBAC sont alimentées mais pas encore lues).
