# Feuille de route

## Phase 1 — Fondations
- [x] Application Next.js App Router et TypeScript
- [x] Interface de tableau de bord responsive
- [x] Connexion Neon par variable d'environnement
- [x] Migration SQL initiale
- [x] API de lecture et création des produits
- [x] Validation serveur des produits
- [x] Structure de dossiers alignée sur OCTOPLUS (app, components, lib, db)
- [x] Charte rouge et noir
- [ ] Vérification `npm install`, typecheck et build dans un environnement Node

## Phase 2 — Sécurité
- [ ] Authentification
- [ ] Rôles : administrateur, gestionnaire, magasinier, vendeur
- [ ] Contrôle des droits dans chaque route API
- [ ] Journal d'audit

## Phase 3 — Stock
- [ ] Modifier et archiver un produit
- [ ] Entrées, sorties, retours et ajustements transactionnels
- [ ] Seuils et alertes de stock
- [ ] Fournisseurs et commandes d'achat

## Phase 4 — Commerce et pilotage
- [ ] Clients, ventes et lignes de vente
- [ ] Décrémentation de stock atomique lors de la validation d'une vente
- [ ] Rapports, exports CSV/PDF
- [ ] Code-barres et impression

## Phase 5 — Mise en ligne
- [ ] Créer le dépôt GitHub `yem2/gestion-de-stock`
- [ ] Créer une base Neon distincte d'OCTOPLUS
- [ ] Configurer les variables d'environnement Vercel
- [ ] Vérifier les builds et tester en preview avant la production

- [x] Authentification, rôles et journal d'audit (migration 0001)
- [x] En-têtes de sécurité HTTP
- [x] Écran de gestion des utilisateurs
- [x] Mouvements de stock transactionnels
- [x] Fournisseurs, clients, ventes
- [x] Rapports (CSV/Excel, impression)

- [x] Interface adaptable (mobile, tablette, ordinateur)
- [ ] Tests automatisés
- [ ] Export PDF natif des rapports
