# Notes de sécurité

- Ne pas réutiliser la chaîne de connexion Neon d'OCTOPLUS.
- Les routes API de ce squelette ne sont pas encore protégées par une authentification : ne pas ouvrir l'application à de vrais utilisateurs avant d'ajouter les sessions et les autorisations serveur.
- Ne jamais faire confiance au rôle ou au prix envoyés par le navigateur; revalider les droits et calculer les totaux côté serveur.
- Les mouvements et ventes devront modifier les quantités avec des transactions SQL afin d'éviter les stocks négatifs et les doubles déductions.
