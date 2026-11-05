# Adam Studio Desktop : prototype Windows

Ce prototype ouvre le Studio existant dans une fenêtre Electron. Il utilise encore le dépôt et les outils déjà installés sur la machine. Ce n’est pas un installeur autonome.

## Lancer

- Double-cliquer sur `Adam Studio Desktop.cmd` à la racine du dépôt.
- Ou lancer `npm run desktop` depuis la racine.

Prérequis : Node 24+, dépendances du dépôt installées, moteurs vidéo configurés comme pour le Studio web. Lors d’une nouvelle installation des dépendances, laisser s’exécuter le téléchargement officiel d’Electron ; si les scripts npm sont désactivés, exécuter `node node_modules/electron/install.js` explicitement.

## Comportement

- Backend Node indépendant de la fenêtre, sur un port local libre. Il ne remplace ni n’arrête l’instance web du port 4317.
- Projets, DA et réglages existants réutilisés depuis les réglages Adam. Aucun projet de démonstration créé au lancement normal.
- Profil de navigateur desktop séparé ; taille, position, maximisation et zoom sauvegardés dans le dossier utilisateur Electron.
- Une seconde ouverture ramène la fenêtre existante au premier plan.
- Une fenêtre hors écran est repositionnée si un moniteur a disparu. Les coordonnées négatives d’un écran secondaire sont prises en charge.
- Fermeture avec contrôle des tâches actives : revenir au Studio ou arrêter les tâches et fermer. Le processus moteur et son arbre de sous-processus Windows sont arrêtés à la fermeture.
- Interface isolée sans accès Node, navigation externe bloquée dans la fenêtre, liens HTTP(S) ouverts dans le navigateur habituel. Les requêtes locales portent un secret de session créé à chaque lancement.
- Les menus natifs sont initialisés dans la langue des réglages au démarrage.

## Vérifications

`npm run test -w @adam-studio/desktop` vérifie le positionnement des fenêtres et les règles de liens.

`npm run desktop:smoke` ouvre une fenêtre cachée avec réglages et profil temporaires. Il vérifie l’interface réelle, le refus d’un accès sans session, l’absence de Node dans l’interface, la détection d’une tâche simulée et la fermeture. Aucun appel IA payant ni écriture dans les projets de l’utilisateur.

## Étape suivante

Construire les points d’entrée exécutables, remplacer les chemins du dépôt, préparer les dépendances natives et les modèles, puis créer un installeur Windows avec Electron Forge. Les tests macOS, la signature et les mises à jour ne sont pas inclus dans ce prototype. Voir `docs/desktop-distribution.md`.

Limite de ce prototype : ne pas lancer deux générations ni modifier simultanément le même projet depuis le Studio web et le Studio desktop. Les fichiers de projet sont partagés, mais les deux moteurs n’ont pas encore de verrou commun entre processus.
