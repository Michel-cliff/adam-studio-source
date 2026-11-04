# Adam Studio : application installable Windows et macOS

Étude du 3 novembre 2026. Proposition d’architecture, sans génération ni publication d’installeur à ce stade.

## Choix proposé

Utiliser **Electron + Electron Forge**, en conservant l’interface React, le serveur local Node et le moteur Remotion. Ce choix est une conclusion tirée du code actuel : Adam utilise déjà Node, des tâches externes, FFmpeg et Python. Electron évite d’ajouter un moteur Rust et une gestion de Node en sidecar pour cette première distribution.

Forge fournit la chaîne de packaging, les installeurs et l’intégration de la signature : [présentation officielle](https://www.electronforge.io/core-concepts/why-electron-forge). Tauri reste une alternative, mais nécessiterait d’embarquer et piloter le backend Node comme binaire séparé : [binaires externes Tauri](https://v2.tauri.app/develop/sidecar/).

| Cible initiale | Livrable | Construction et vérification |
| --- | --- | --- |
| Windows x64 | `Adam Studio Setup.exe` via Squirrel.Windows | Machine/runner Windows, puis essai sur Windows sans environnement de développement |
| macOS Apple Silicon | `Adam Studio.app` dans un `.dmg` | Machine/runner macOS arm64, signature et notarisation |
| macOS Intel | `.app` + `.dmg` séparés, après validation des dépendances | Machine/runner macOS x64 |

Ne pas annoncer un binaire universel tant que Python, les bibliothèques natives et le rendu n’ont pas été testés sur chaque architecture. Les formats sont documentés par Forge : [Windows](https://www.electronforge.io/config/makers/squirrel.windows), [DMG](https://www.electronforge.io/config/makers/dmg).

## Architecture à construire

1. Un nouveau workspace `packages/desktop` lance une fenêtre Electron et le backend Adam.
2. Le backend réutilise `createApp()` de `packages/web/server/app.ts` ; il écoute uniquement sur `127.0.0.1`, sur un port libre, avant de charger l’interface.
3. La fenêtre attend que le backend soit prêt et conserve taille, position et zoom. Au démarrage, vérifier que sa position appartient encore à un moniteur disponible ; sinon recentrer la fenêtre.
4. Les ressources livrées sont en lecture seule. Projets, réglages, modèles, journaux et caches vivent dans les dossiers utilisateur. Importer les réglages existants de `~/.adam-studio` sans écraser les projets.
5. Encadrer la fermeture pendant une tâche : permettre de revenir dans l’application ou d’arrêter proprement les processus. Ne pas laisser de serveur, de FFmpeg ou de moteur IA orphelin.

La version Node intégrée doit satisfaire le `node >=24` du dépôt. Si le choix d’Electron ne le permet pas, prévoir un runtime Node compagnon compatible plutôt que supposer cette compatibilité.

## Travail nécessaire dans le dépôt

| Élément actuel | Adaptation à prévoir |
| --- | --- |
| `server/main.ts` : port 4317 et ouverture du navigateur | Entrée desktop avec port libre, démarrage contrôlé et fenêtre dédiée |
| `server/paths.ts` : chemins du dépôt et scripts TypeScript | Résolveur de ressources packagées ; construction des points d’entrée serveur, CLI et MCP |
| `server/actions.ts`, `server/jobs.ts`, moteur de rendu | Vérifier tous les chemins exécutés depuis le paquet installé, avec espaces et accents |
| `py/analysis` et `py/capcut` : environnements Python dans le dépôt | Runtime Python/deps propres à chaque plateforme dans un dossier utilisateur ou ressources exécutables adaptées |
| `server/doctor.ts` et `setup.ts` : winget/Homebrew/npm | Assistant de premier démarrage graphique ; ne pas dépendre de Node, Python ou Homebrew préinstallés pour une distribution autonome |
| `server/settings.ts` : réglages dans le dossier personnel | Migration compatible, séparation ressources/réglages/projets |
| Intégrations Claude/Codex | Détection des exécutables, installation proposée et connexion par l’utilisateur ; aucun identifiant ni jeton dans le paquet |

## Ce qu’il faut embarquer ou télécharger

- Interface compilée et moteur serveur/CLI/MCP avec leurs dépendances nécessaires.
- FFmpeg et ffprobe pour chaque système et architecture.
- Les exécutables natifs Remotion et son navigateur de rendu compatible. Le Chromium de la fenêtre Electron ne remplace pas automatiquement le navigateur piloté par Remotion : [ensureBrowser](https://www.remotion.dev/docs/renderer/ensure-browser).
- Runtime Python et dépendances compatibles : notamment faster-whisper, ctranslate2, NumPy, OpenCV et l’inpainting. Valider séparément analyse CPU, performances et fonctionnalités disponibles sur chaque cible.
- Modèles lourds téléchargés au premier usage dans le cache utilisateur, avec version, contrôle d’intégrité, progression et reprise après interruption. Ne pas alourdir la première installation avec tous les modèles optionnels.
- Polices et ressources effectivement redistribuables. Établir la liste des licences des dépendances livrées, notamment FFmpeg, modèles et Remotion : [licence Remotion](https://www.remotion.dev/docs/license/pricing).

Les exécutables et bibliothèques natives ne doivent pas dépendre d’une exécution depuis l’archive ASAR : prévoir `extraResource`/dépaquetage et tester les chemins réels. [Contraintes ASAR](https://www.electronjs.org/docs/latest/tutorial/asar-archives).

## Sécurité et distribution

- Fenêtre avec `nodeIntegration: false`, `contextIsolation: true` et isolation du contenu ; ne pas exposer une commande système générique au rendu.
- Bloquer les navigations externes dans la fenêtre et ouvrir les liens externes autorisés dans le navigateur habituel.
- Pour l’API locale sensible : valider l’origine, conserver le serveur sur loopback et prévoir une authentification propre à la session desktop. Adapter les règles actuelles aux appels de la fenêtre sans les rendre permissives.
- Ne pas inclure `.env`, comptes IA, projets personnels, rushes ou caches privés.
- Signer les installeurs destinés au public. Sur macOS, prévoir signature Developer ID et notarisation ; une simple compilation Windows ne produit pas une application macOS signée. [Signature macOS](https://www.electronforge.io/guides/code-signing/code-signing-macos).
- Suivre les recommandations de sécurité Electron et maintenir ses dépendances : [documentation officielle](https://www.electronjs.org/docs/latest/tutorial/security).

## Ordre d’implémentation

1. Prototype desktop interne : ouvrir l’interface existante, lancer/arrêter proprement le backend, mémoriser la fenêtre et tester le passage entre moniteurs.
2. Supprimer la dépendance aux chemins du dépôt, construire les points d’entrée et séparer les données utilisateur des ressources de l’application.
3. Préparer les moteurs natifs et le téléchargement contrôlé des modèles, d’abord sur Windows x64.
4. Générer un installeur Windows interne et vérifier un cycle complet import → script → variantes → timeline → export MP4 et CapCut.
5. Refaire ces contrôles sur macOS Apple Silicon puis Intel, avant signature/notarisation et distribution.
6. Ajouter ensuite les mises à jour, leur signature, le retour à la version précédente et la conservation des projets.

## Critères d’acceptation

Installation sur une machine vierge sans outils de développement ; nom de dossier avec espaces/accents ; changement de moniteur et de mise à l’échelle ; premier démarrage en français/anglais ; reprise après téléchargement interrompu ; import d’un projet existant ; annulation d’une génération ; export réel ; fermeture/réouverture ; mise à jour conservant projets et DA ; désinstallation sans suppression involontaire des créations.

Les essais macOS et la signature restent à réaliser sur une machine/CI macOS disposant des certificats du projet. Cette étude ne constitue pas un installeur testé.
