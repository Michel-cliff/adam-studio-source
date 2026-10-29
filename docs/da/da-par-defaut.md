# ADAM Studio : DA par défaut

Version 2, 29 octobre 2026. Spec produit : ce que le moteur applique quand le créateur n'a rien défini. Objectif
unique : qu'un run 1 sans aucun réglage soit publiable tel quel, et ne ressemble pas à tous les autres runs 1.

Cette version corrige la v1 (28 octobre) après relecture et après une première implémentation mesurée sur une vraie
prise. Chaque section porte son état : **en place** (dans le moteur, testé) ou **à faire**.

## Le principe : récessif, pas signé

Une DA par défaut ne doit pas avoir de goût. Si elle en a, chaque vidéo sortie d'ADAM se reconnaît, et un créateur
qui se reconnaît dans l'outil plutôt que dans sa propre chaîne s'en va.

La qualité perçue au run 1 vient de l'exécution, pas du style : sous-titres lisibles et bien synchronisés, silences
coupés, niveaux audio normalisés, texte hors des zones d'interface, rythme calé sur la parole. Un montage
techniquement irréprochable et stylistiquement muet passe pour professionnel.

**Le défaut est dérivé, jamais imposé.** Ce qui peut porter une signature (la couleur, la texture) est extrait du rush.
Ce qui est purement technique (tailles, marges, niveaux, durées) est fixé en dur par le moteur.

**Question tranchée.** La v1 laissait ouverte la question d'un défaut reconnaissable comme canal d'acquisition. Elle
est fermée : ADAM est un outil local, open source, pour des créateurs qui ont déjà une chaîne. Un défaut reconnaissable
y coûte les utilisateurs qui restent le plus longtemps et n'achète rien de mesurable. Le défaut reste récessif. On
mesure seulement la part de créateurs qui définissent leur propre DA dans leurs trois premières vidéos.

## Portée : le défaut, pas le catalogue

Cette spec gouverne ce que le moteur fait **de lui-même**. Elle n'interdit rien de ce que le créateur ou Adam
choisissent explicitement :

- **Transitions et mouvements de caméra** : flash, whip, zoom, camera.zoom, camera.window restent au catalogue. Le
  run 1 n'en pose aucun de lui-même ; une proposition A / B / C peut en contenir, le créateur décide.
- **Typographie** : ADAM garde ses polices. Les rôles et tailles ci-dessous s'appliquent aux polices du style.

## Où vit chaque valeur

| Nature | Où | Exposé au créateur |
|---|---|---|
| Goût (polices, couleurs, look, mouvement) | `style.json` du projet, les looks, la DA guidée | oui |
| Dérivé du rush (teinte d'accent, place du visage, traitement des sous-titres) | calculé à l'analyse et au rendu, en cache dans le projet | non, mais annoncé |
| Justesse (niveaux audio, zone sûre, seuils de contraste, silences) | constantes du moteur | jamais |

Un créateur qui peut régler son loudness finira par livrer une vidéo inaudible : la troisième ligne n'a pas de
réglage, par principe.

## Le contrat du run 1

1. **Lisible** : aucun texte hors de la zone sûre, aucun texte sur les yeux ni la bouche, contraste ≥ 4,5:1 sur son
   fond réel.
2. **Entendu** : −14 LUFS intégré, crête vraie ≤ −1,0 dBTP, musique baissée sous la voix.
3. **Rythmé** : silences > 0,6 s ramenés à 0,25 s, premier changement visuel avant 2,0 s.
4. **Cohérent** : une seule couleur d'accent, deux familles typographiques au plus.
5. **Fini** : pas de plan noir, pas de coupe dans un mot, pas de sous-titre orphelin au dernier plan.

Ce sont des tests, pas des intentions : chaque point a sa ligne dans les tables de la fin.

## Durées : toujours en images

Toutes les durées de cette spec sont en millisecondes, et le moteur travaille en images. Règle : **arrondi à l'image
la plus proche, jamais à zéro.** À 30 i/s, 60 ms font 2 images, 120 ms en font 4.

## Couleur : dérivée du rush (en place)

Deux neutres fixes, une couleur d'accent extraite de l'image.

| Rôle | Valeur | Pourquoi pas la version pure |
|---|---|---|
| Encre | `#121212` | Le noir pur s'écrase sur OLED et ne raccorde pas avec les noirs d'un capteur |
| Papier | `#F4F2ED` | Le blanc pur vibre contre la vidéo et brûle en compression plateforme |

Contraste encre / papier : 16,7:1. Jamais d'accent en corps de texte.

**L'accent : teinte dérivée, chroma et clarté imposés.**

1. Échantillonner une image toutes les 2 s, 60 échantillons au plus.
2. Masquer la peau (boîte de visage de l'analyse, dilatée de 20 %) et les pixels de chroma OkLCh < 0,04.
3. Histogramme de teinte pondéré par chroma × surface, bacs de 10°.
4. Prendre le mode. Si le deuxième pèse plus de 80 % du premier, prendre le plus éloigné de la teinte de peau.
5. Reconstruire : `oklch(0.74 0.15 H)` sur encre, `oklch(0.48 0.15 H)` sur papier.

Pire cas mesuré sur 360° : 8,0:1 sur encre, 4,9:1 sur papier. Vérifié : `#FB817A` sur `#121212` donne 7,58:1 ; la
conversion du moteur retrouve les 16 couleurs du tableau à 3 niveaux près, et 4,5:1 tient tous les 5°. Sur la prise de
référence, l'affiche orange du décor donne la teinte 35°, soit `#FA8467`.

La dérivation ne s'applique qu'au style par défaut intact : un style choisi par le créateur, ou des couleurs qu'il a
réglées, l'emportent. Elle remplace la couleur de surlignage et l'accent par une seule couleur.

**Repli** (pas de rush, rush monochrome, chroma dominant < 0,04) : `H = hash(clé du projet) mod 360`, où la clé est
faite des fichiers sources des prises, pas du nom du projet : renommer un projet ne change pas sa couleur.

Règles d'emploi au run 1 : une seule teinte d'accent ; l'accent souligne un mot déjà lisible, il ne porte jamais
l'information seul ; surface d'accent ≤ 8 % de l'image sur un plan ; aucun dégradé, aucune ombre colorée, aucun glow.

## Typographie

Les polices sont celles du style (ADAM garde les siennes ; les polices maison Anton, DM Serif Display et Manrope sont
proposées à l'installation). Deux familles au plus : une pour les titres, une pour les sous-titres.

| Rôle | Graisse | Taille | Interlignage | Interlettrage |
|---|---|---|---|---|
| Hook / titre, jusqu'à 5 mots | Bold | 92 px | 0,95 | −2 % |
| Hook / titre, 6 à 8 mots | Bold | 56 px | 1,00 | −2 % |
| Sous-titre | SemiBold | 62 px | 1,10 | −1 % |
| Carton, label, étape | Medium | 36 px | 1,25 | 0 |
| Source, mention, chiffre secondaire | Regular | 28 px | 1,30 | +1 % |

**Correction v1.** La v1 donnait « 92 px, 4 à 8 mots, ≤ 720 px, 2 lignes ». À 92 px, une grotesque grasse occupe
environ 0,52 em par caractère : 15 caractères par ligne de 720 px, 30 sur deux lignes, soit 5 mots français (6
caractères par mot avec l'espace). Au-delà de 5 mots, le titre passe à 56 px, ce qui tient 8 mots sur deux lignes.

## Lisibilité adaptative (en place)

Un contour noir épais partout est la signature du montage automatique. Le moteur mesure, sous chaque sous-titre et à
chaque plan, la luminance moyenne et l'écart-type du fond sur la boîte du texte dilatée de 8 px, et applique le
premier traitement suffisant :

| # | Traitement | Quand |
|---|---|---|
| 0 | Ombre `0 4px 12px rgba(0,0,0,0.55)` | fond sombre (< 0,25) et calme (écart-type < 0,10) |
| 1 | Ombre renforcée `0 4px 18px rgba(0,0,0,0.80)` | fond sombre et agité |
| 2 | Contour 3 px encre, jamais plus | fond clair ou mi-clair |
| 3 | Plaque encre à 88 %, marge 18 / 10 px, coins 6 px | fond clair (≥ 0,5) et agité |

Le traitement se décide par sous-titre, sur trois instants de son temps d'écran (20 %, 50 %, 80 %) ; le plus fort des
trois l'emporte. Calculé au rendu, gardé en cache tant que le montage ne change pas ; l'aperçu du studio lit ce cache
et n'attend jamais l'analyse.

Mesuré sur une vraie prise (bureau éclairé, affiche orange) : fond mi-clair et agité (0,43 / 0,21), donc contour.

## Zone sûre et placement

Tout texte et tout graphisme tiennent dans **x 72 à 900, y 269 à 1248**, avec 24 px de respiration à l'intérieur.
La marge droite est plus large : elle porte la colonne de boutons de l'app.

| Bande y | Ce qu'elle porte |
|---|---|
| 0 → 269 | Interface plateforme : en-tête, nom de compte |
| 269 → 600 | Titres : hook des premières secondes, sujet, titre de section |
| 600 → 950 | Impact : un mot, un chiffre, en grand et bref |
| 950 → 1248 | Sous-titres, labels, sources |
| 1248 → 1920 | Interface plateforme : légende, pseudo, barre de progression. Jamais de texte |

Une seule zone occupée à la fois, hors sous-titres. Centré sur x 540, ligne ≤ 720 px, deux lignes au plus, coupe au
sens.

| Élément | x | Ligne de base | Taille | Contrainte |
|---|---|---|---|---|
| Hook / titre | centré 540 | 430 | 92 ou 56 px | voir Typographie |
| Mot d'impact | centré 540 | 790 | 110 px | 1 à 3 mots, ≤ 2,0 s |
| Sous-titre | centré 540 | 1180 (dernière ligne) | 62 px | 2 lignes, ≤ 720 px |
| Label, source | gauche 120 | 1000 | 36 / 28 px | au-dessus du sous-titre |

Vérifié : un sous-titre de deux lignes à 62 px occupe 1067 → 1195, il reste 29 px avant la limite de 1224.

**Le visage passe avant le texte (en place).** L'analyse trouve le visage à chaque instant mesuré (cascade Haar
fournie avec OpenCV, image égalisée, recherche fine : 25 images sur 25 sur une vraie prise en gros plan, contre 12
avec les réglages par défaut), en déduit la bande yeux → bouche (de 25 % à 82 % de la hauteur du visage), et cherche
les mains dans la bande des sous-titres (peau apprise sur le visage, donc toutes les carnations). Le sous-titre :

- descend en bas de la bande s'il couvrirait les yeux ou la bouche ;
- remonte en haut de la bande quand des mains ou un objet y entrent (plus de 15 % de la bande) ;
- ne sort jamais de 950 → 1248.

Mesuré sur une vraie prise : le micro tenu à hauteur de poitrine couvre 19 à 24 % de la bande, le sous-titre remonte.

**Format 16:9 (à faire).** Les valeurs ci-dessus sont pour 1080 × 1920. En 16:9, le moteur place provisoirement les
sous-titres entre 70 % et 93 % de la hauteur ; les bandes, la zone sûre et les lignes de base restent à définir.

Les bandes d'interface sont à revalider par capture réelle sur chaque plateforme avant le gel : elles bougent à chaque
refonte d'app.

## Sous-titres

| Paramètre | Valeur | État |
|---|---|---|
| Mots par carton | 3 à 5 | en place (premier jet) |
| Caractères par carton | 32 max | en place (premier jet) |
| Lignes | 2 max | en place |
| Durée à l'écran | 0,8 s min, 3,5 s max | en place ; un carton tenu sous 0,8 s par le suivant est fusionné au premier jet, nommé à l'export pour les anciens |
| Apparition | 60 ms avant le premier mot (2 images à 30 i/s) | en place |
| Disparition | 120 ms après le dernier mot (4 images) | en place |
| Silence > 1,2 s | zone vidée | en place (le carton part 120 ms après son dernier mot) |

La découpe ne finit jamais sur un article ou une préposition (il passe au carton suivant, avec son nom). Un carton
coupé en deux par une coupe garde l'avance avant son premier morceau et la traîne après son dernier, rien à la coupe.
Les élisions, les mots composés et les domaines que la transcription sépare sont recollés (« n'ai », « est-ce »,
« jobless.fr »), y compris dans les sous-titres déjà écrits.

Pas de fondu à l'apparition ni à la disparition. Le mot en cours passe en couleur d'accent, par simple changement de
couleur : pas d'agrandissement, pas de rebond. Ponctuation : points finaux retirés, `?` et `!` gardés. Aucune
reformulation : le sous-titre dit ce qui a été dit.

**Confiance de transcription (en place).** Whisper donne une probabilité par mot. ≥ 0,80 : normal ; 0,60 à 0,80 :
souligné en orange dans la timeline, avec sa confiance au survol ; < 0,60 : souligné en rouge et compté, plus de 3
déclenchent un avertissement à l'export qui nomme leurs timecodes. Une langue détectée sous 0,70 est signalée. Sur la
prise de référence : 18 mots à revoir, dont 6 sous 0,60.

## Rythme

### Silences (en place)

| Durée | Action |
|---|---|
| < 0,6 s | intact : c'est la respiration d'une phrase |
| > 0,6 s | ramené à 0,25 s, jamais à zéro, coupe au milieu du silence |
| > 3,0 s | ramené à 0,25 s **et signalé** (souvent une reprise ratée) |

Le moteur retire les marqueurs d'hésitation de la langue, les **bégaiements** (le même mot redit à moins de 0,4 s :
seul le dernier reste) et les faux départs (la phrase reprise sur ses mêmes premiers mots après une pause). Il ne
retire jamais une répétition volontaire, une phrase complète, ni un mot qu'il juge inutile.

La coupe tombe au milieu du silence gardé : avec 0,25 s, 125 ms de chaque côté, au-dessus des 80 ms minimum.

C'est la variante A du premier jet ; la variante B (légère : hésitations et pauses de plus de 0,9 s) reste proposée.

### Rythme visuel

**En place :** poussée continue face caméra de 1,2 % par seconde sur les plans dont personne n'a réglé le zoom, sens
alterné d'un plan au suivant (l'un pousse depuis 1,00, le suivant revient à 1,00), 8 % au plus par plan, donc 1,08× au
plus. Le premier changement visuel après 2,0 s est signalé à l'export.

**À faire :** Plan de 12 s au plus sans changement. Dernier plan coupé
400 ms après le dernier mot, sans fondu au noir. Flou de périphérie couplé à la poussée (1,2 à 2,2 px, masque autour
du visage, désactivé quand le visage dépasse 55 % de la hauteur) ; le texte est composité en dernier et jamais flouté.

## Audio : la baseline invisible (en place)

Entièrement fixée en dur. Rien n'est dérivé, rien n'est exposé.

### Chaîne de voix, appliquée une fois à l'analyse

1. Coupe-bas à 80 Hz, 12 dB par octave.
2. Réduction de bruit **seulement si** le plancher dépasse −50 dBFS, plafonnée à 8 dB.
3. Dé-sibilance légère.
4. Compression 3:1, seuil −18 dB, attaque 10 ms, relâchement 100 ms.
5. Voix en mono, 48 kHz.

Mesuré : un grondement à 40 Hz perd plus de 12 dB.

### Respirations

Les respirations entre les mots sont baissées de 6 dB, pas coupées : une voix sans aucun souffle s'entend montée.

### Musique

Baissée de 12 dB sous la voix, automatiquement : attaque de 80 ms **terminée quand le mot commence** (le moteur connaît
le moment à l'avance, la voix ne part donc jamais sur une musique forte), maintien 200 ms, relâchement 400 ms. Un son
de plus de 4 s est un lit musical ; plus court, c'est un effet placé exprès, laissé tel quel.

La musique entre après le hook, jamais sur la première phrase (montée de 0,6 s à la première pause après le hook),
et sort par une descente de 0,8 s finie avant la dernière image. Aucune musique choisie par défaut.

### Niveaux de sortie

| Mesure | Cible | Pourquoi |
|---|---|---|
| Loudness intégré | −14 LUFS | cible de normalisation des plateformes |
| Crête vraie | ≤ −1,0 dBTP | marge pour leur encodage AAC |
| Étendue de loudness | ≤ 7 LU | au-delà, le spectateur règle le volume |
| Échantillonnage | 48 kHz | |

**Correction v1, mesurée.** Normaliser à −1,5 dBTP ne suffit pas : l'encodage AAC qui suit fait remonter les crêtes
d'environ 1 dB (−0,6 dBTP mesuré sur une vraie prise). Le moteur vise donc **−2,5 dBTP** ; le limiteur ne touche que
les crêtes, le loudness intégré reste à −14. Si l'encodage dépasse malgré tout, une dernière correction de quelques
dixièmes ramène sous −1. Sur la prise de référence : −24,5 → −14,9 LUFS, crête −1,9 dBTP.

**Correction v1, mesurée.** Le plancher de bruit se juge **sur la voix traitée, avant le gain final** : le gain de
normalisation (+10 dB sur la prise de référence) remonte le plancher d'autant, et une prise correcte (−45,8 dBFS)
serait refusée à tort (−33 dBFS après gain). Le plancher se mesure par fenêtres de 50 ms, au 10ᵉ centile, sans les
instants de silence numérique.

## Ce que le moteur ne fait jamais de lui-même

1. Insérer un plan de banque d'images ou un visuel généré.
2. Choisir une musique à la place du créateur.
3. Reformuler, raccourcir ou corriger ce qui a été dit.
4. Ajouter un emoji, une majuscule ou un point d'exclamation absents du propos.
5. Poser un tiret cadratin à l'écran.
6. Utiliser une deuxième couleur d'accent, ou une troisième famille typographique.
7. Poser une transition animée ou un recadrage sur une coupe (le catalogue reste disponible sur demande).
8. Placer un logo, un générique, un carton de fin ou un fondu au noir.
9. Animer le surlignage mot à mot autrement que par la couleur.
10. Dépasser 3 % par seconde de poussée.
11. Ramener un silence à zéro.
12. Recadrer en continu sur un visage.

## Tests bloquants : l'export est refusé

Un export refusé est renommé `.refused.mp4` (il ne passe jamais pour une vidéo finie) et le rendu donne les raisons.

| Test | Seuil | État |
|---|---|---|
| Loudness intégré | −15 à −13 LUFS | en place |
| Crête vraie | ≤ −1,0 dBTP | en place |
| Plancher de bruit (voix traitée, avant gain) | ≤ −35 dBFS | en place |
| Silence total | ≤ 15 % de la durée | en place |
| Sous-titre hors de la zone sûre | x 72–900, y 269–1248, respiration 24 px | en place (sous-titres ; titres à faire) |
| Texte sur les yeux ou la bouche | aucune image | placement en place, test à faire |
| Contraste texte / fond réel | ≥ 4,5:1 | traitement en place, mesure du contraste rendu à faire |
| Coupe à l'intérieur d'un mot | aucune | en place : réparée avant le rendu (le clip qui tient la plus grande part du mot le garde entier) |
| Sous-titre sur plus de 2 lignes | aucun | en place |
| Image noire | aucune | en place |
| Familles typographiques | ≤ 2 | en place |
| Zones occupées en même temps, hors sous-titres | 1 | à faire |
| Contraste d'échelle, mode texte seul | ≥ 2,5:1 par carton | à faire |

## Tests d'avertissement : l'export passe, le créateur est prévenu

| Test | Seuil | Message | État |
|---|---|---|---|
| Plancher de bruit | −45 à −35 dBFS | le son restera moyen, et pourquoi | en place |
| Pause très longue | > 3,0 s | nomme l'endroit à revoir | en place |
| Mots de confiance < 0,60 | > 3 | nomme les timecodes à relire | en place |
| Langue détectée | < 0,70 | vérifier la langue | en place |
| Carton de sous-titre | < 0,8 s | à fusionner avec son voisin | en place |
| Deux couleurs d'accent | | une suffit | en place |
| Premier changement visuel | après 2,0 s | démarrage lent | en place |
| Surface d'accent | > 8 % d'un plan | l'accent devient un fond | à faire |
| Rush plus court que le script | rush < 0,8 × durée parlée | il manquera de l'image | à faire |
| Aucune musique fournie | | une fois, sans insister | en place |

## Contrôle à l'ingestion, avant tout calcul (en place, sauf la langue du script)

Refuser tôt coûte trente secondes ; découvrir le même défaut au run 1 coûte un run complet.

| Test | Seuil | Si échec |
|---|---|---|
| Résolution | ≥ 1080 sur le petit côté | avertir, continuer |
| Cadence | ≥ 25 i/s, constante | avertir, continuer |
| Codec | H.264 / H.265 8 bits | transcoder, annoncer le temps ajouté |
| Plancher de bruit | ≤ −35 dBFS | bloquer, le dire tout de suite |
| Piste audio | présente, hors mode texte seul | bloquer |
| Langue du script = langue du rush | | demander, ne pas deviner |

## Les formats et le mode texte seul (à faire)

Les trois formats (face caméra, motion design, tuto), les six archétypes de carton du mode texte seul et leurs trois
règles anti-diaporama sont repris de la v1 sans changement. Le tuto garde 0,40 s de silence au lieu de 0,25 s ; le
projet devra porter son format pour que le moteur le sache.

## Définir sa propre DA : le parcours guidé (à faire)

Repris de la v1 sans changement : rien avant le run 1 ; trois variantes jouées sur le rush du créateur, 6 s chacune ;
le moteur annonce ce qu'il a dérivé avant de demander ; six étapes dans l'ordre d'impact (accent, sous-titres, rythme,
mouvement, typographie, interdits) ; enregistrement après chaque étape ; arrêt de la proposition après trois vidéos
sans étape franchie.

ADAM a déjà deux mécanismes de goût, le dossier Inspiration et ses looks, et les règles apprises (Statistiques). Le
parcours guidé doit écrire dans les mêmes : un look pour l'accent, la typographie et le mouvement, des règles pour les
interdits. Pas un troisième stockage.

## Retiré de la v1

**Le rétroplanning** (heure de dépôt, régimes confortable / normal / serré). ADAM est un outil local : un run prend
quelques minutes sur la machine du créateur, qui peut relancer aussitôt. Il n'y a ni file d'attente ni heure de
livraison, et un régime qui dégrade la sortie selon l'horloge donnerait des vidéos différentes avec les mêmes rushes,
sans raison visible. Les contrôles à l'ingestion, eux, sont gardés.
