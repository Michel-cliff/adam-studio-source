# Adam Studio : règles d'interface et de tâches

Ces règles décident quand on hésite. Une fonction qui en casse une doit le justifier.

## Le parcours

La première vidéo passe avant tout réglage. Direction artistique, bibliothèque, statistiques et connecteurs attendent que le créateur ait vu un résultat.

1. **Projets.** Un clic ouvre une vidéo. Le bouton Nouveau projet est en haut.
2. **Nouvelle vidéo.** La vidéo d'abord : on la dépose, le nom vient du fichier, le reste a une valeur par défaut. Un seul bouton : Créer et analyser.
3. **Import.** Des étapes lisibles, le journal replié. On peut partir, l'import continue.
4. **Studio.** Deux chemins toujours visibles : Laisser Adam finir, ou faire les étapes une à une.
5. **Livraison.** Le bouton d'export, la progression sur place, le MP4 quand il est prêt.
6. **Ensuite.** Revenir sur une étape, choisir une autre variante, exporter à nouveau. La direction artistique est proposée ici.

## Règles d'interface

1. **Une action principale par écran.** Elle est remplie en crème, les autres ne le sont pas.
2. **Une seule consigne par écran.** La ligne au-dessus des images. Pas de répétition en bas de page, dans une bulle et dans un toast.
3. **Un clic suffit.** Pas de double-clic, pas de raccourci à apprendre, pas de texte qui explique comment ouvrir quelque chose.
4. **Un interrupteur ne lance rien.** Ce qui consomme du temps ou du quota part d'un bouton qui le dit.
5. **Un chemin vers l'avant reste toujours visible.** Après un arrêt, une erreur ou la fin d'une étape, l'écran montre quoi faire.
6. **Ce qui n'est pas fini ne ressemble pas à ce qui est fini.** Un aperçu est marqué comme aperçu. Un MP4 plus ancien que les derniers changements le dit.
7. **Une erreur dit quoi faire.** Une phrase et l'action possible. Le journal brut reste derrière Détails.
8. **Le travail montre où il en est.** Au-delà de 2 secondes, un signe de vie. Au-delà de 30 secondes, un pourcentage ou une étape, et un moyen d'arrêter.
9. **Quitter une page n'arrête rien.** Revenir retrouve le même état.
10. **Les mêmes mots partout, et dans la langue du créateur.** Une consigne ne cite pas un bouton qui porte un autre nom.
11. **Tailles fixes.** Une fonction ajoutée n'agrandit jamais la page et n'écrase jamais une colonne. On mesure à 1440x900 et 1280x720.
12. **Ce qui se supprime se récupère.** La corbeille est un dossier, et Annuler revient sur le dernier changement.
13. **Adam ne coupe jamais.** Il monte, il ne coupe ni ne réordonne la vidéo du créateur.

## Tâches qui se chevauchent

On ne refuse jamais un clic parce que la machine est occupée. Le travail prend sa place dans la file, visible dans Tâches depuis toutes les pages. Implémenté dans `packages/web/server/jobs.ts`.

| Type | Travaux | Règle |
|---|---|---|
| Lourd | Export MP4, export CapCut, revue, import, analyse, mise en page des cartes | Un seul à la fois sur tout l'ordinateur. Les autres attendent leur tour, dans l'ordre de la demande |
| IA | Demandes à Claude ou Codex | Tournent à côté de tout, car elles attendent surtout le réseau |
| Léger | Vidéo de référence | Tourne à côté de tout, et ne bloque jamais un export |

Dans un même projet :
- Ce qui écrit dans le projet (une demande à l'IA, une analyse) passe un par un, dans l'ordre.
- Un export lit le montage une fois, à son départ. Une demande à l'IA peut donc tourner pendant l'export. Le MP4 ne contient pas ce changement, et la Livraison le signale.
- Le même travail demandé deux fois sur un projet reste un seul travail.

Pourquoi un seul travail lourd à la fois : le rendu et l'analyse prennent tous les cœurs et une grande part de la mémoire. Deux en même temps vont chacun beaucoup moins vite et risquent de manquer de mémoire.

Une image de contrôle demandée pendant un export ne gêne pas cet export : chaque travail a son propre dossier de rendu.

Limite connue : une application IA connectée (Claude Desktop, Codex) qui lance un rendu passe par son propre serveur et n'entre pas dans cette file.

## Vitesse : ce qui a été mesuré

Portable i5-12450H (12 threads), 16 Go, RTX 3050, vidéo 1080x1920 de 66 s, en utilisation normale (navigateur et VS Code ouverts). 

| Export complet, machine au calme | Préparation | Images | Son et fin | Total |
|---|---|---|---|---|
| Avant | 60 s | 442 s | 20 s | 522 s |
| Après | 32 s | 377 s | 36 s | **445 s (15 % de moins)** |

Parcours complet réel, de « Créer et laisser Adam finir » au MP4, sur une vidéo de 25 s : **6 min 55 s** (import 106 s, IA 70 s, export 214 s), sans intervention.

Rendu des images, sur 600 images :

| Réglage | ms par image | Mémoire libre au plus bas | Décision |
|---|---|---|---|
| Processeur, 4 onglets, x264 veryfast | 270 | | Repli si la carte graphique échoue |
| Carte graphique, 4 onglets, cache par défaut | 189 | 0,5 Go | |
| Carte graphique, 4 onglets, cache 1 Go | 181 | 1,2 Go | |
| **Carte graphique, 3 onglets, cache 1 Go** | **180** | **1,3 Go** | **Retenu** |
| Carte graphique, 2 onglets, cache 1 Go | 198 | 1,7 Go | |
| Carte graphique, 8 onglets | 297, jusqu'à 496 en fin de rendu | | Écarté : la mémoire s'épuise |
| 2 navigateurs de 3 onglets | 197 | 0,2 Go | Écarté : aucun gain |
| 3 navigateurs de 2 onglets | 505 | 0,1 Go | Écarté : la machine échange sur le disque |

Image comparée au processeur : 46 dB PSNR, SSIM 0,99, soit identique à l'œil.

Ce qu'il faut retenir :
- **Une mesure sur 150 images trompe.** Elle donnait 92 ms par image, alors que le régime établi est à 180 ms. Toujours mesurer sur au moins 600 images.
- **La mémoire compte autant que la vitesse.** Sans limite, un rendu laisse moins de 1 Go libre sur une machine de 16 Go, et tout le reste ralentit. C'est une piste sérieuse pour un rendu qui semble bloqué, sans preuve à ce stade.
- **Le vrai plafond est la puce graphique utilisée.** Sur ce portable hybride, Chrome reste sur la puce Intel (98 %) et la NVIDIA est à 0 %, même avec la préférence graphique de Windows pour ce programme. Remotion ne permet pas de passer l'option à Chrome. C'est la seule grosse marge restante, à regarder si un rendu doit encore gagner du temps.
- **NVENC écarté :** gain faible et qualité non réglable (fichier 4 fois plus petit).

Autres décisions :
- **Import :** x264 veryfast au lieu de medium sur la copie de travail (20 s au lieu de 30 s pour 30 s de vidéo 4K, même poids, 45 dB). Le décodage matériel a été écarté : 120 s au lieu de 19 s.
- **Lisibilité des sous-titres :** lue sur l'aperçu au lieu du fichier 1080p, car la recherche de position y prenait les deux tiers du temps (74 s à 25 s, aucun des 86 sous-titres déplacé, 2 traitements différents). Le visage est cherché une fois par sous-titre.
- **Le code du rendu n'est plus reconstruit à chaque export ou image de contrôle** (10 s économisées à chaque fois).
- **IA en parallèle dans le mode automatique :** écartée. Les demandes ne pèsent que 20 à 70 s chacune, et une étape s'appuie sur les choix de la précédente.
- **Plusieurs navigateurs en parallèle :** écartés, voir le tableau.
- **Un calque transparent reste sur le processeur :** c'est sur ce réglage que la transparence a été vérifiée dans CapCut.
- **Un rendu qui ne bouge plus pendant 10 minutes** repart sans la carte graphique, puis s'arrête avec une raison s'il bloque encore.
