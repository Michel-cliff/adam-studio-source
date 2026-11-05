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

Limite connue : une application IA connectée (Claude Desktop, Codex) qui lance un rendu passe par son propre serveur et n'entre pas dans cette file.

## Vitesse : ce qui a été mesuré

Mesures faites sur un portable i5-12450H, 16 Go, RTX 3050, sur 150 images d'une vidéo 1080x1920.

| Réglage du rendu | ms par image | Décision |
|---|---|---|
| Départ (processeur, x264 medium, 6 onglets) | 175 | |
| 2, 4 ou 8 onglets au lieu de 6 | 173 à 178 | Aucun gain seul |
| x264 veryfast | 157 | Gardé |
| Carte graphique (ANGLE) | 104 | Gardé, repli automatique sur le processeur |
| Carte graphique et veryfast | 92 | **Retenu**, avec 4 onglets. Image : 46 dB PSNR, SSIM 0,99 par rapport au départ |
| NVENC | 151 | Écarté : fichier 4 fois plus petit, qualité non réglable |
| Threads de décodage vidéo x2 | 166 | Écarté : gain faible |

Autres décisions :
- **Import :** x264 veryfast au lieu de medium sur la copie de travail (20 s au lieu de 30 s pour 30 s de vidéo 4K, même poids, 45 dB). Le décodage matériel a été écarté : 120 s au lieu de 19 s.
- **IA en parallèle dans le mode automatique :** écartée. Les demandes ne pèsent que 20 à 70 s chacune, et une étape s'appuie sur les choix de la précédente.
- **Un calque transparent reste sur le processeur :** c'est sur ce réglage que la transparence a été vérifiée dans CapCut.
- **Un rendu qui ne bouge plus pendant 10 minutes** repart sans la carte graphique, puis s'arrête avec une raison s'il bloque encore.
