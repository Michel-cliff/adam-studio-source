# QA et prochaine release

## Version 0.1.10 publiée

Release : https://github.com/Michel-cliff/adam-studio-releases/releases/tag/v0.1.10

La demande du 26 novembre 2026 est terminée : construction Windows, publication et synchronisation des sources publiques et privées. Le correctif de navigation est livré dans la 0.1.10 ; il ne figurait pas dans le ZIP 0.1.9.

- Le signalement devient une icône avec infobulle et libellé accessible traduits.
- Tâches, signalement, Guide et FR/EN restent regroupés dans la barre de navigation.
- « Tâches » reprend la casse et le style de « Guide ».

Validations de cette release : TypeScript sur tous les packages, 269 tests du studio, 61 tests du lanceur, huit contrôles Chromium en français et anglais à 1440, 1280, 1024 et 390 pixels, puis démarrage du paquet Windows en profil isolé. Les sources UI et l’archive native embarquées correspondent aux sources contrôlées. Le ZIP, les sept artefacts distants et leurs empreintes sont vérifiés. Le flux réel de mise à jour depuis la 0.1.9 pointe vers Michel-cliff/adam-studio-releases et les paquets 0.1.10 attendus.

ZIP local : `packages/desktop/out/make/squirrel.windows/x64/AdamStudio-0.1.10-Windows.zip`.

Les installateurs restent non signés. Les alertes de dépendances antérieures restent suivies dans QA-AUDIT-2026-11-15.md. Aucune modification supplémentaire du code applicatif après la construction.

## Version 0.1.9 publiée

Release : https://github.com/Michel-cliff/adam-studio-releases/releases/tag/v0.1.9

Les archives Windows, le delta, le manifeste et leurs empreintes sont vérifiés. Le canal de mise à jour est contrôlé depuis la 0.1.8. Le ZIP local est `packages/desktop/out/make/squirrel.windows/x64/AdamStudio-0.1.9-Windows.zip`.

Validations : 269 tests du studio, 213 du rendu, 61 du lanceur Windows, 58 tests Python CapCut, TypeScript sur tous les packages. Six scénarios d’intégration et un export CapCut Python complet réussis en profil vierge. Le paquet Windows passe le test de démarrage et produit un MP4 avec audio et ouverture CRT ainsi qu’un projet CapCut complet ; la progression CapCut atteint 100 % une seule fois. Le signalement est vérifié dans Chromium, avec téléchargement réel du journal et secours hors connexion, sans envoi d’e-mail.

Les installateurs restent non signés. Huit alertes de dépendances restent à suivre dans QA-AUDIT-2026-11-15.md ; cette passe ne certifie pas l’absence de failles.

## Autorisation et portée

Nouvelle consigne de Michel du 15 novembre 2026 : terminer les corrections, tester E2E, construire et publier la 0.1.9, mettre à jour le texte de la carte sur cliffiscurious.com et fournir le ZIP local. Elle remplace la suspension du build du 13 novembre.

La 0.1.9 regroupe le correctif CapCut ci-dessous et le signalement volontaire de blocages avec logs nettoyés. Aucune donnée ni aucun e-mail ne sont envoyés automatiquement. Voir QA-AUDIT-2026-11-15.md pour la portée et les limites de la passe.

## Correctif livré en 0.1.9 : progression de l’export CapCut

La barre affichait 0 à 100 % pour chaque rendu intermédiaire, donnant l’impression que l’export recommençait. La progression est désormais globale, pondérée par les frames : les rendus occupent 0 à 90 %, puis viennent la création du projet, la copie des médias et son écriture. Le statut 100 % est réservé à la création réussie du projet et de son rapport.

Les tâches et la page Livraison affichent la phase en cours, avec traduction française. Les événements découpés en plusieurs morceaux sont reconstitués ; un événement tardif ne fait pas reculer la barre. Le chemin final reste seul sur stdout pour la CLI Python sans préparation.

Validations locales déjà réussies : TypeScript sur tous les packages ; 257 tests du studio ; 10 tests ciblés du rendu ; 58 tests Python CapCut. Les trois tests d’intégration de préparation et le test d’export CapCut complet sur projets factices ont également réussi. La progression reste croissante et atteint 100 % seulement à la fin.

Le correctif de `fix/capcut-export-progress` est livré dans la 0.1.9. La 0.1.8 ne le contient pas.

## Historique : préparation de la 0.1.8

Note du 13 novembre 2026. Michel a autorisé le build et la publication de la 0.1.8.

## Corrections

- Le contrôle des noirs exclut uniquement les fenêtres des ouvertures CRT déclarées dans la timeline. Les vrais trous noirs restent bloquants. La durée affichée utilise deux décimales.
- Les vidéos sans piste audio passent aussi le contrôle de leur image.
- Une tâche annulée pendant le traitement de la file ne peut plus être lancée depuis le lot en cours. Le test reproduit une annulation déclenchée par la fin d'une autre tâche.

## Validations avant build

- 210 tests unitaires du rendu, 254 du studio et 57 du lanceur Windows réussis.
- Vérification TypeScript de tous les packages réussie.
- Deux tests de rendu complets réussis, dont un export Remotion 1080 × 1920 avec ouverture CRT et piste audio.
- Tests de maintien du refus des noirs imprévus, de fenêtres qui se chevauchent et du contrôle sans piste audio.
- Le rendu utilisateur refusé en 0.1.7 a été relu sans modification : aucun noir imprévu avec le contrôle corrigé.

## Distribution

Les notes françaises et anglaises sont dans les notes de version 0.1.8. Les sources doivent être synchronisées sur les dépôts public et privé. Le build Windows, son test de démarrage et la vérification des fichiers précèdent la publication sur Michel-cliff/adam-studio-releases. Les installateurs de ce canal ne sont pas encore signés.

La 0.1.7 publiée ne contient pas ces correctifs. Cette note ne vaut pas confirmation de publication : vérifier la release GitHub 0.1.8.
