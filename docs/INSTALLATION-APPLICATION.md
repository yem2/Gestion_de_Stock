# Installer l'application (Android, iPhone, iPad, tablette, ordinateur)

L'application est une **application web installable (PWA)**. Dès l'ouverture du lien, chaque visiteur reçoit une proposition adaptée à son appareil :

| Appareil | Ce que voit l'utilisateur |
|---|---|
| Android (téléphone ou tablette), Chrome / Samsung Internet | Bouton **Installer** (icône sur l'écran d'accueil, plein écran) |
| Android, Firefox | Mode d'emploi : menu ⋮ → Installer |
| iPhone / iPad (Safari) | Mode d'emploi : Partager → Sur l'écran d'accueil (Apple n'offre pas de bouton automatique) |
| iPhone dans Instagram, Facebook… | Invitation à ouvrir le lien dans Safari |
| Windows, Mac, Linux, Chromebook (Chrome, Edge) | Bouton **Installer** (fenêtre dédiée, icône sur le bureau) |
| Mac (Safari) | Mode d'emploi : Fichier → Ajouter au Dock |
| Firefox sur ordinateur | Rien (non supporté) ; la page `/installer` explique d'utiliser Chrome ou Edge |

- La proposition peut être repoussée 14 jours (« Plus tard ») ou 1 an (« Ne plus me le proposer »). Le menu garde toujours l'entrée **Installer l'application**.
- La page publique **`/installer`** présente toutes les versions avec un QR code à scanner depuis un téléphone ou une tablette.
- Rien n'est proposé si l'application est déjà installée.
- Sécurité : le service worker n'enregistre **jamais** les pages ni les réponses de l'API (données privées). Seuls la page « hors ligne », les icônes et les fichiers statiques du site sont conservés.

## Applications natives (APK, App Store, Windows, Mac)

La version web installable suffit pour tous les appareils. Si vous voulez en plus de **vraies applications téléchargeables**, il faut les fabriquer et les signer (comptes et clés personnels, impossible à automatiser ici). Quand un lien existe, ajoutez-le dans les variables d'environnement **Vercel** (Settings → Environment Variables), puis redéployez : le bouton de téléchargement apparaît tout seul pour les appareils concernés, dans la fenêtre d'installation et sur `/installer`.

| Variable | Exemple | Résultat |
|---|---|---|
| `NEXT_PUBLIC_ANDROID_APP_URL` | `https://play.google.com/store/apps/details?id=cm.gestion.stock` ou `https://…/stock.apk` | « Télécharger sur Google Play » ou « Télécharger l'APK Android » |
| `NEXT_PUBLIC_IOS_APP_URL` | `https://apps.apple.com/app/id…` ou `https://testflight.apple.com/join/…` | « App Store » ou « TestFlight » |
| `NEXT_PUBLIC_WINDOWS_APP_URL` | `https://…/Gestion-de-Stock-Setup.exe` | « Télécharger pour Windows » |
| `NEXT_PUBLIC_MAC_APP_URL` | `https://…/Gestion-de-Stock.dmg` | « Télécharger pour Mac » |
| `NEXT_PUBLIC_LINUX_APP_URL` | `https://…/Gestion-de-Stock.AppImage` | « Télécharger pour Linux » |

Seuls les liens `https://` sont acceptés (les autres sont ignorés).

### Android (APK ou Google Play)
1. Allez sur **pwabuilder.com**, saisissez l'adresse de votre site, choisissez **Android** : l'outil génère un projet « Trusted Web Activity » (application qui affiche votre site en plein écran).
2. Générez le fichier **.apk** (installation directe) ou **.aab** (Google Play, compte développeur à environ 25 $, paiement unique). Conservez précieusement le fichier de clé (keystore) et son mot de passe.
3. Pour que l'application s'ouvre sans barre d'adresse, ajoutez dans Vercel :
   - `ANDROID_PACKAGE_NAME` : l'identifiant de l'application (ex. `cm.gestion.stock`) ;
   - `ANDROID_SHA256_CERT_FINGERPRINTS` : l'empreinte SHA-256 de la clé (séparez plusieurs empreintes par des virgules) ;
   - `NEXT_PUBLIC_ANDROID_PACKAGE` : le même identifiant (le navigateur proposera alors d'ouvrir l'application).
   Le site publie alors `/.well-known/assetlinks.json` automatiquement.

### iPhone et iPad
Apple impose l'**App Store** pour une vraie application (compte Apple Developer à environ 99 $ par an) ; PWABuilder ou Capacitor peuvent emballer le site. Sans cela, l'installation depuis Safari (Partager → Sur l'écran d'accueil) fonctionne très bien. Pour tester avant publication, utilisez **TestFlight** et mettez son lien dans `NEXT_PUBLIC_IOS_APP_URL`.

### Windows, Mac, Linux
L'installation depuis Chrome ou Edge crée déjà une application de bureau. Pour un installateur à télécharger : PWABuilder (paquet Windows MSIX, Microsoft Store) ou un emballage Electron / Tauri qui produit `.exe`, `.dmg` et `.AppImage`. Hébergez les fichiers (GitHub Releases convient) et renseignez les variables ci-dessus.

## Maintenance
- Icônes : `public/icons/` (192, 512, adaptative 512, iPhone 180). Remplacez-les par vos propres visuels en gardant les mêmes noms et tailles.
- Nom, couleurs, raccourcis : `app/manifest.ts`.
- Service worker : `public/sw.js` (changer `VERSION` force la mise à jour du cache).
