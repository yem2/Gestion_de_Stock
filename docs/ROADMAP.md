# Feuille de route

## Phase 1 — Fondations (terminée)
- [x] Application Next.js App Router et TypeScript, tableau de bord responsive
- [x] Connexion Neon, migration initiale, validation serveur
- [x] Charte rouge et noir
- [x] Vérification `npm install`, typecheck, lint et build (Next 16, 0 faille `npm audit`)

## Phase 2 — Sécurité (terminée)
- [x] Authentification, rôles (super admin, admin, gestionnaire, magasinier, vendeur)
- [x] Contrôle des droits dans chaque route API
- [x] Journal d'audit, en-têtes de sécurité HTTP
- [x] Limitation des tentatives de connexion par compte et par IP

## Phase 3 — Stock
- [x] Modifier et archiver / restaurer un produit
- [x] Entrées, sorties et ajustements d'inventaire atomiques, avec historique
- [x] Seuils et alertes de stock (centre d'alertes, réapprovisionnement rapide)
- [ ] Retours
- [ ] Fournisseurs et commandes d'achat

## Phase 4 — Commerce et pilotage
- [ ] Clients, ventes et lignes de vente
- [ ] Décrémentation de stock atomique lors de la validation d'une vente
- [ ] Rapports, exports CSV/Excel/PDF
- [ ] Code-barres et impression

## Phase 5 — Qualité et mise en ligne
- [ ] Écran de gestion des utilisateurs (l'API existe déjà)
- [ ] Pagination et recherche côté serveur
- [ ] Tests automatisés (auth, droits, mouvements)
- [ ] Vérifier les builds et tester en preview avant la production
