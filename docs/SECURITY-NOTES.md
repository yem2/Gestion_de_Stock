# Notes de sécurité

- Ne pas réutiliser la chaîne de connexion Neon d'OCTOPLUS : ce projet a sa propre base.
- Toutes les routes API (sauf `/api/health`, `/api/auth/login`, `/api/auth/setup`) exigent une session valide ; le rôle est revérifié côté serveur à chaque requête (jamais depuis le navigateur).
- Les écritures vérifient que l'origine de la requête est identique au site (protection CSRF) ; les cookies de session sont `HttpOnly`, `SameSite=Lax` et `Secure` en production.
- Connexion : blocage du compte 15 minutes après 5 échecs, et limitation par adresse IP (20 échecs / 15 min, table `login_attempts`). Limite connue : le blocage par compte permet à un tiers de bloquer temporairement un compte dont il connaît l'e-mail.
- Les mouvements de stock sont atomiques (une instruction SQL) ; chaque mouvement garde l'auteur, la quantité avant et après.
- Les totaux et les prix sont toujours calculés / validés côté serveur (zod).
- Après la première installation, supprimer la variable `SETUP_KEY`.
- Surveiller `npm audit` à chaque mise à jour de dépendances.
