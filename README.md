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

## Phase 03 — Entrepôts et transferts

Migrations à appliquer **avant** de déployer le code correspondant :

1. `db/0010_phase3_stock_foundations.sql` — tables de la phase 3 (transferts, inventaires, codes-barres, réservations, notifications, permissions).
2. `db/0011_transfers_functions.sql` — correction du déclencheur de soldes, types de mouvement `transfer_out` / `transfer_in`, fonctions `ship_transfer`, `receive_transfer`, `cancel_transfer`.

Principes :
- `products.quantity` reste le stock **total sous responsabilité de l'entreprise** (entrepôts + en transit). Les ventes, achats et mouvements existants agissent sur l'entrepôt principal ; le déclencheur applique la variation à son solde.
- Un transfert déplace uniquement les soldes par entrepôt : expédition = retrait de l'origine (stock en transit), réception = ajout à la destination. Le total ne change pas.
- Une vente ou une sortie supérieure au stock de l'entrepôt principal est refusée (409) même si le total est suffisant.
- Les numéros de transfert (`TR-AAAA-00001`) sont générés côté serveur, sans doublon, via `document_sequences`.
- Limite actuelle : la réception est complète (pas de réception partielle) ; les ventes ne choisissent pas encore l'entrepôt.

## Phase 03 — Inventaires physiques

Migration : `db/0012_inventory_counts.sql` (à appliquer **avant** de déployer le code).

- Un inventaire fige le stock attendu de chaque produit pour un entrepôt, puis les quantités comptées sont saisies (statuts : en cours → à approuver → approuvé, ou annulé).
- Une seule session active par entrepôt.
- L'approbation (`approve_inventory_count`) applique les écarts *compté − attendu* au solde de l'entrepôt et au total du produit, et journalise un mouvement « Inventaire » par écart. Tout réussit ou rien n'est modifié.
- Les produits non comptés ne sont pas modifiés. Si le stock a baissé entre le comptage et l'approbation au point de rendre un écart négatif impossible, l'approbation est refusée et l'inventaire doit être recommencé.
- Droits : comptage pour administrateurs, directeurs et magasiniers ; approbation pour administrateurs et directeurs.

## Codes-barres

Aucune migration : la table `product_barcodes` (migration 0010) est utilisée telle quelle.

- Un produit peut avoir plusieurs codes-barres ; un code est unique par entreprise (le même code peut exister dans deux entreprises différentes).
- Ajout et retrait depuis la fenêtre « Modifier le produit » : un lecteur saisit le code puis envoie Entrée.
- Dans une nouvelle vente, le champ de scan retrouve le produit par code-barres, sinon par référence exacte. Un second scan du même produit augmente la quantité, dans la limite du stock. Les produits en rupture sont refusés.
- Un lecteur de codes-barres USB ou Bluetooth se comporte comme un clavier : aucun réglage particulier n'est nécessaire.

## Phase 04 — Achats : approbation et réceptions partielles

Migration : `db/0013_purchase_workflow_receipts.sql` (à appliquer **avant** de déployer le code). Les commandes existantes ne changent pas.

- Statuts : `draft` (brouillon) → `submitted` (à approuver) → `ordered` (commandée, prête à recevoir) → `partially_received` → `received`, ou `cancelled`.
- L'approbation est **optionnelle** : par défaut une commande est directement « commandée » ; la case « Enregistrer en brouillon » ajoute l'étape soumission puis approbation (permission `purchases.approve`).
- Numéros `CA-AAAA-00001` (commandes) et `REC-AAAA-00001` (bons de réception), générés côté serveur sans doublon.
- Réception (`receive_purchase`) : quantités reçues et rejetées par ligne, plusieurs réceptions possibles ; une quantité ne peut pas dépasser le reste à recevoir. Le stock n'augmente que des quantités reçues. Tout est enregistré dans une seule transaction.
- Une commande ne peut plus être annulée dès qu'une réception a eu lieu.
- Pas encore : factures fournisseur, retours fournisseur et tolérance de dépassement de commande.

## Phase 02 — Droits lus depuis la base, doublons, isolation

Migration : `db/0014_rbac_alignment.sql` (à appliquer **avant** de déployer le code).

- **Droits** : le serveur lit les permissions de l'utilisateur dans la base (`memberships → membership_roles → role_permissions → permissions`) à chaque requête. `DB_PERMISSIONS` (dans `lib/roles.ts`) relie chaque permission de l'application aux codes de la base. Si un utilisateur n'a aucun rôle RBAC, on retombe sur son rôle historique (`users.role`) pour ne jamais verrouiller un compte existant.
- **Équivalence vérifiée** : sur 140 combinaisons (5 rôles historiques × 28 permissions), la base donne la même réponse que l'ancienne matrice, sauf deux écarts voulus par le cahier des charges (4.1) : le directeur peut consulter le journal d'audit, et le gestionnaire de stock peut archiver des produits.
- **Limite** : les boutons des écrans suivent encore le rôle historique ; seuls le menu, l'accès aux pages et toutes les routes API suivent la base. Les rôles personnalisés demandent donc un écran de gestion des rôles (à venir).
- **Doublons sur les ventes** : l'en-tête `Idempotency-Key` (une clé par ouverture de la fenêtre « Nouvelle vente ») est enregistré dans la même transaction que la vente. Un envoi répété renvoie la vente d'origine, sans second retrait de stock. Les clés ne sont pas encore purgées.
- **Tests d'isolation** : `node scripts/check-isolation.mjs` (sur une branche de test) vérifie 20 contrôles : entrepôts, transferts, inventaires, codes-barres, clés d'idempotence, numérotation, et les fonctions SQL appelées par une autre entreprise.

## Photo de profil (migration 0015)

Chaque utilisateur gère sa photo dans **Paramètres → Ma photo de profil**. Le navigateur recadre l'image en carré et la réduit à 256×256 (JPEG) avant l'envoi ; le serveur vérifie le type réel du fichier et refuse plus de 200 Ko. L'image est stockée en base (`user_avatars`), visible uniquement par les membres de la même entreprise, et affichée dans le menu, la barre du haut et la liste des utilisateurs. Sans photo, les initiales s'affichent.

## Paiements (migration 0016)

- **Modes de paiement** par entreprise (espèces, Orange Money, MTN Mobile Money, carte, virement), créés automatiquement pour chaque nouvelle entreprise.
- **Paiements** : encaissements (`in`) et règlements (`out`), numérotés `PAY-AAAA-00001`, affectés à des ventes ou des commandes d'achat (`payment_allocations`). Les paiements non affectés sont conservés séparément. Un paiement validé n'est jamais supprimé : il est **contrepassé** avec son motif.
- **Soldes calculés depuis les paiements sources** (vues `sale_balances`, `purchase_balances`) : reste dû = total − paiements validés ; les paiements « en attente » (opérateur mobile) sont réservés sans être comptés.
- **Ventes à crédit** : champ « Montant encaissé » dans la vente ; en dessous du total, un client est obligatoire et le plafond de crédit du client (`customers.credit_limit`, vide = illimité) est vérifié. Annuler une vente contrepasse ses paiements propres ; elle est refusée si un paiement est partagé avec d'autres documents.
- **API** : `GET/POST /api/payments`, `POST /api/payments/:id/reverse`, `GET /api/payment-methods`, `GET /api/finance/receivables`, `GET /api/finance/payables`. Le POST accepte l'en-tête `Idempotency-Key`.
- **Opérateurs mobiles** : les fonctions `record_payment(... 'pending', provider, provider_reference)` et `settle_pending_payment` préparent les retours d'Orange Money et de MTN MoMo (référence unique, notification rejouable sans effet). Les connexions aux API des opérateurs restent à brancher.
- Limite : l'annulation d'une vente contrepasse ses paiements, mais le remboursement effectif (caisse) relève du module Dépenses/Caisse, à venir.

## Typographie

Police unique **Inter** (chargée par `next/font/google` au build, donc hébergée avec le site), chiffres alignés (`tabular-nums`) pour les montants, titres resserrés, rendu net sur tous les écrans. Si le build n'a pas accès à Internet, il retombe sur les polices du système.

## Paiements mobiles : Orange Money et MTN MoMo (migration 0017)

**Principe.** Depuis *Paiements → Créances clients → Encaisser*, choisir Orange Money ou MTN Mobile Money envoie une vraie demande à l'opérateur. Le paiement est créé « en attente » (le montant est réservé sur la vente, sans être compté) puis devient « validé » ou « échoué » selon l'opérateur.
- **MTN MoMo** (`requesttopay`) : la demande arrive sur le téléphone du client, qui confirme avec son code secret.
- **Orange Money** (Web Payment) : le client règle sur la page sécurisée d'Orange (lien affiché dans la fenêtre).
- **Rien n'est cru sur parole** : les notifications des opérateurs (`/api/payments/webhooks/orange`, `/api/payments/webhooks/mtn`) ne servent que de déclencheur ; le statut final est toujours relu chez l'opérateur. Une notification rejouée ou contradictoire n'a aucun effet sur un paiement déjà réglé.
- **Aucune demande perdue** : la fenêtre relit le statut toutes les 4 s ; le bouton « Vérifier le statut » existe dans la liste ; un rapprochement quotidien (`/api/cron/reconcile-payments`, protégé par `CRON_SECRET`) règle les paiements restés en attente, et une demande sans réponse après 60 min expire. Le cron est quotidien pour rester compatible avec le plan gratuit de Vercel ; passez-le à `*/15 * * * *` dans `vercel.json` avec un plan Pro.
- **Doublons** : référence unique par demande, clé d'idempotence, une seule demande possible par solde dû.
- **Non configuré** : tant que les variables ne sont pas renseignées (voir `.env.example`), l'encaissement Orange/MTN reste possible en mode manuel (déjà confirmé), avec un message explicite. `GET /api/payments/mobile/config` indique les noms des variables manquantes, jamais leurs valeurs.
- **À faire pour passer en production** : obtenir les accès chez MTN MoMo Developer (produit Collections, puis activation Cameroun) et chez Orange Developer / Orange Money (clé marchand), renseigner les variables dans Vercel, tester d'abord en `sandbox` (MTN : numéros de test fournis par MTN, devise EUR ; Orange : devise OUV), puis passer `*_ENV=production`.
- **Limites** : encaissement des ventes uniquement (pas encore de paiement sortant vers les fournisseurs par mobile money) ; ces connexions n'ont pas pu être testées ici sans accès réseau ni clés — elles suivent la documentation des opérateurs et doivent être validées en sandbox.
