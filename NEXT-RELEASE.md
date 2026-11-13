# Correctifs intégrés à la préparation de la 0.1.8

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
