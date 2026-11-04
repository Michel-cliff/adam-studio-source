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

## Limites connues

- Cible vérifiée : Windows x64. Aucun paquet macOS, Windows ARM ou Linux livré ici.
- Version non signée : la réputation et les avertissements Windows d’un fichier téléchargé restent à traiter avant une distribution publique.
- L’export CapCut est embarqué mais expérimental, et demande CapCut Desktop sur la machine. L’export MP4 reste le parcours principal de cette version.
- Le détourage d’images n’est pas disponible dans la version installée.
- Les modèles ne sont pas téléchargés pendant l’installation et les fournisseurs IA nécessitent une connexion et un compte utilisateur.
- Pas de système de mises à jour automatiques configuré pour cette première version.
- Les essais locaux avec un environnement réduit ne remplacent pas la validation sur une machine Windows vierge, avec différents processeurs et réglages de sécurité.

## Validation locale du prototype

- Installation par utilisateur Windows et lancement du programme installé avec un profil temporaire.
- Raccourcis Bureau/menu Démarrer, icône de l’exécutable, du Setup et de la liste des applications Windows.
- API locale privée, absence de Node dans la fenêtre et arrêt d’une tâche simulée.
- Node, Python et FFmpeg installés vérifiés avec un PATH limité aux moteurs embarqués et à Windows.
- Export MP4 court sur une vidéo synthétique avec les moteurs portables, sans appel IA payant.
- Sept tests du conteneur Electron, tests ciblés du serveur et vérification TypeScript du dépôt.

Ces vérifications ont été faites sur la machine de développement, où Visual C++ est présent. Une machine Windows vierge reste à tester avant diffusion publique.

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
