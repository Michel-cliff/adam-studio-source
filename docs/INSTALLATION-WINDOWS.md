# Adam Studio : première installation Windows

## Ce que contient cette version

Le fichier `AdamStudio-Setup.exe` installe Adam Studio pour l’utilisateur Windows, sans demander d’installer Node ou Python à la main. Le paquet embarque Node, npm, Python avec les bibliothèques d’analyse, FFmpeg/ffprobe, les outils de référence web et le navigateur de rendu Remotion.

Cette première version est destinée à un essai local. Elle n’est pas signée numériquement et n’est pas une publication publique validée.

## Prérequis Windows

Windows x64 doit disposer du [Microsoft Visual C++ Redistributable x64](https://aka.ms/vc14/vc_redist.x64.exe), utilisé par les bibliothèques d’analyse Python. Il est déjà présent sur la machine de développement ; cette première version ne l’installe pas automatiquement. En cas d’erreur concernant `msvcp140.dll` ou de chargement de PyTorch sur un autre PC, installer le paquet officiel Microsoft puis relancer Adam.

## Premier usage

1. Fermer le prototype de développement avant d’ouvrir la version installée. Éviter de modifier le même projet depuis deux instances différentes.
2. Lancer le Setup, puis Adam Studio depuis le menu Démarrer.
3. Conserver ou choisir le dossier des projets dans la page Projets. Les créations ne sont pas rangées dans le dossier du programme.
4. Choisir son moteur IA et connecter son propre compte Claude ou Codex. Les comptes et identifiants ne font pas partie de l’installeur.
5. Prévoir une connexion internet pour le premier téléchargement des modèles d’analyse, environ 2 Go selon les fonctions activées. Les téléchargements restent dans les caches utilisateur et ne sont pas inclus dans le Setup.

Les projets, DA et réglages existants d’Adam sont réutilisés. La désinstallation du programme ne doit pas supprimer les créations ni les réglages utilisateur.

## Comportement de Setup (mesuré le 2026-11-06)

- Rien ne s'affiche pendant 60 s ou plus après le double-clic : Squirrel décompresse le paquet d'environ 1 Go avant sa fenêtre. L'installation complète a pris 8 min sur la machine de développement.
- Un second Setup pendant une installation affiche « Installation has failed… contact the author » et laisse une installation cassée, sans `AdamStudio.exe`. Un seul Setup lancé ensuite la répare.
- Setup relancé alors qu'Adam est installé : il ferme l'application sans demander, même pendant un rendu, efface le dossier du programme puis réinstalle. Les données et les projets sont ailleurs et ne sont pas touchés. La mise à jour depuis l'application, elle, ne redémarre jamais pendant un rendu.
- Journal réel : `%LOCALAPPDATA%\SquirrelTemp\Squirrel-Install.log`.

Squirrel ne permet ni d'empêcher le double lancement ni d'afficher une fenêtre plus tôt. Le ZIP contient donc `Installer Adam Studio.exe` (`packages/desktop/installer-launcher.cs`, compilé par `make-installer.mjs` avec le compilateur C# de Windows), qui s'ouvre tout de suite, refuse un second lancement ou une application ouverte, signale un ZIP non décompressé, puis lance `fichiers/AdamStudio-Setup.exe`. Le Setup seul reste publié sur GitHub et reste lançable à la main.

## Limites connues

- Cible vérifiée : Windows x64. Aucun paquet macOS, Windows ARM ou Linux livré ici.
- Version non signée : la réputation et les avertissements Windows d’un fichier téléchargé restent à traiter avant une distribution publique.
- L’export CapCut est embarqué mais expérimental, et demande CapCut Desktop sur la machine. L’export MP4 reste le parcours principal de cette version.
- Le détourage d’images n’est pas disponible dans la version installée.
- Les modèles ne sont pas téléchargés pendant l’installation et les fournisseurs IA nécessitent une connexion et un compte utilisateur.
- Les essais locaux avec un environnement réduit ne remplacent pas la validation sur une machine Windows vierge, avec différents processeurs et réglages de sécurité.

## Validation locale du prototype

- Installation par utilisateur Windows et lancement du programme installé avec un profil temporaire.
- Raccourcis Bureau/menu Démarrer, icône de l’exécutable, du Setup et de la liste des applications Windows.
- API locale privée, absence de Node dans la fenêtre et arrêt d’une tâche simulée.
- Node, Python et FFmpeg installés vérifiés avec un PATH limité aux moteurs embarqués et à Windows.
- Export MP4 court sur une vidéo synthétique avec les moteurs portables, sans appel IA payant.
- Sept tests du conteneur Electron, tests ciblés du serveur et vérification TypeScript du dépôt.

Ces vérifications ont été faites sur la machine de développement, où Visual C++ est présent. Une machine Windows vierge reste à tester avant diffusion publique.

## Rapports de problème

Quand le démarrage échoue, que le moteur ou la fenêtre s'arrête, ou depuis le menu Application, Signaler un problème, Adam propose un rapport (`packages/desktop/crash.cjs`). Rien ne part sans la personne : elle voit un aperçu, le refus est le choix par défaut, puis un e-mail se prépare dans sa messagerie et c'est elle qui l'envoie. Le nom d'utilisateur Windows, le dossier personnel, les clés et les adresses e-mail sont retirés avant l'affichage. Aucune clé d'envoi n'est embarquée.

Le lien e-mail est limité à environ 1 900 caractères : le milieu du journal est retiré si besoin, et le rapport complet reste dans le presse-papiers et dans `crash-reports` du dossier de données. L'adresse de réception est `SUPPORT_EMAIL` dans `crash.cjs`. Un plantage natif du processus principal ne passe pas par ce mécanisme.

## Reconstruction depuis le dépôt

Sur la machine de construction, installer les dépendances de développement, configurer les environnements d’analyse/CapCut et disposer de FFmpeg, ffprobe, yt-dlp, Deno et du navigateur Remotion. Puis lancer :

```text
npm run desktop:make
```

Les sorties se trouvent dans `packages/desktop/out`. Le dossier `.build` contient les ressources préparées. Ces dossiers sont ignorés par Git et ne doivent pas contenir de projets, de clés ni de médias de référence privés.

Pour vérifier le programme assemblé sans utiliser les projets de l’utilisateur :

```text
AdamStudio.exe --smoke-test
```

Ce mode crée un profil temporaire, vérifie la fenêtre, l’API locale et l’arrêt d’une tâche simulée, puis ferme l’application.

Avant une distribution publique : compléter la revue des licences des binaires embarqués, signer le programme et l’installeur, tester installation/mise à jour/désinstallation dans une machine virtuelle propre, puis préparer un canal de mises à jour signé.

## Publier une mise à jour

L'application installée regarde les versions publiées sur le dépôt public `Michel-cliff/adam-studio-releases`, 15 secondes après le démarrage puis toutes les 6 heures, via `update.electronjs.org`. Ce dépôt ne contient que des versions publiées, jamais le code.

1. Monter `version` dans `packages/desktop/package.json` (par exemple `0.1.1`) et écrire ce qui change pour les créateurs dans `packages/desktop/whats-new.json`, en français et en anglais. Le build s'arrête si cette version n'a pas de notes. Le message s'affiche une fois, au premier lancement après la mise à jour, jamais après une première installation.
2. Garder `packages/desktop/out/make/squirrel.windows/x64` tel quel : le paquet précédent y sert à calculer le paquet delta. Ne pas supprimer ce dossier entre deux versions.
3. Lancer `npm run desktop:make` depuis un shell sans `ELECTRON_RUN_AS_NODE`.
4. Sur `adam-studio-releases`, créer une version publiée (ni brouillon, ni pré-version) avec le tag `v0.1.1`, et y joindre `github/RELEASES` (pas le `RELEASES` voisin des paquets), les fichiers `.nupkg` de cette version, `AdamStudio-Setup.exe` et le ZIP. Le nom du tag doit être une version semver, sinon le service l'ignore. Le service ne complète que la première adresse de `RELEASES` et répond par du JSON sur tout autre chemin : avec le fichier brut de Squirrel, la mise à jour échoue en silence dès qu'il y a un delta. `gh` est dans WSL sur la machine de construction.
5. Joindre aussi les sources GPL : `node packages/desktop/make-gpl-sources.mjs 0.1.1 <dossier>` produit `AdamStudio-0.1.1-GPL-sources.zip`. Le script s'arrête si FFmpeg ou yt-dlp ont changé : mettre alors à jour ses versions d'après le README du nouveau build.
6. Tester sur une machine qui a la version précédente : menu Application, puis Rechercher les mises à jour.

Règles côté application : le téléchargement se fait en arrière-plan, la question de redémarrage n'apparaît jamais pendant un rendu, « Plus tard » installe au prochain démarrage. Une erreur de vérification reste silencieuse sauf si le créateur a lancé la recherche depuis le menu. Une mise à jour avec delta a pris 15 min sur la machine de développement (téléchargement 15 s, reconstruction du paquet 9 min, copie 2 min) : si le créateur ferme Adam pendant ce temps, la fenêtre se masque, le moteur reste actif et l'application se ferme seule à la fin, 40 min au plus, sans bloquer l'arrêt de Windows. Une réouverture montre tout de suite la fenêtre. Le menu indique « Mise à jour en cours ».

Après une mise à jour, les connecteurs Claude Desktop, Codex et Claude Code qui pointaient vers l'ancien dossier `app-x.y.z` sont réécrits, et la skill `adam-studio` est remplacée seulement si le créateur ne l'a pas modifiée.

Un projet ouvert par une version récente puis rouvert par une version plus ancienne n'est pas garanti : la compatibilité va vers l'avant.
