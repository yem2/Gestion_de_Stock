# Migrations de la base de données

Les fichiers `db/*.sql` sont appliqués **dans l'ordre**, une seule fois chacun, par `scripts/migrate.mjs`. Le résultat est noté dans la table `schema_migrations` (nom, empreinte, date).

## Commandes
```
npm run migrate:status                    # état de chaque fichier, sans rien modifier
npm run migrate                           # applique ce qui est en attente
node scripts/migrate.mjs --dry-run        # liste ce qui serait appliqué
node scripts/migrate.mjs --check          # code 1 s'il reste des migrations en attente
```
Il faut la variable `DATABASE_URL` (une connexion Neon « pooler » est convertie automatiquement en connexion directe).

## Première utilisation sur votre base actuelle
Votre base a été migrée à la main jusqu'à `0017_mobile_money_sessions.sql`. Au premier lancement, le lanceur le détecte (après avoir vérifié que la table `payment_provider_sessions` existe) et marque ces fichiers comme **déjà appliqués, sans les rejouer**. Seuls les fichiers suivants (`0018…`) seront exécutés. Si la base est plus ancienne, il refuse et vous l'explique.

## Application automatique au déploiement (facultatif)
Rien ne change tant que vous ne l'activez pas. Pour activer : dans Vercel (Settings → Environment Variables, environnement **Production** seulement), ajoutez `RUN_MIGRATIONS=1`. À chaque déploiement de production, les nouvelles migrations sont appliquées **avant** la compilation ; en cas d'erreur, le déploiement s'arrête et l'ancienne version reste en ligne. Les déploiements de test (preview) ne touchent jamais à la base.

## Règles pour écrire une migration
- Nouveau fichier `NNNN_nom.sql` (numéro suivant) ; **ne jamais modifier un fichier déjà appliqué** (le lanceur avertit si son contenu change).
- Chaque fichier est exécuté dans une transaction : s'il échoue, rien n'est enregistré et les suivants ne sont pas lancés.
- Préférez `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` pour qu'il soit rejouable.
- Ne mettez pas `BEGIN` / `COMMIT` dans le fichier.

## Vérification automatique (GitHub)
Le fichier `.github/workflows/ci.yml` rejoue **toutes** les migrations sur une base PostgreSQL vierge à chaque envoi, puis vérifie qu'il ne reste rien en attente. Il aurait détecté l'ancienne erreur de `0013`. Il vérifie aussi les types, le lint, la compilation et les failles connues.

> Le dossier `.github` commence par un point : l'envoi de fichiers par le site GitHub l'ignore souvent. Créez-le avec **Add file → Create new file** en tapant `.github/workflows/ci.yml` comme nom, puis collez le contenu de `docs/ci-github-actions.yml`.
