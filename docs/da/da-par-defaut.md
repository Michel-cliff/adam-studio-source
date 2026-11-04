# ADAM Studio : DA par défaut

Version 3, 3 novembre 2026. Référence visuelle fournie par Michel : `1026_4K.mp4` (25,6 s).

## Le principe : un squelette éditorial, une identité générique

Le défaut et le parcours de création de DA de zéro reprennent la composition de la référence : un titre condensé
en capitales en haut, deux lignes fortes éventuellement reliées par une courte liaison serif italique,
des sous-titres compacts sous le visage et quelques visuels qui illustrent exactement le discours.

La police exacte n'est pas certifiable dans une vidéo aplatie : Anton et Manrope sont les équivalents maison,
avec une serif système en italique pour la liaison. L'absence des polices maison utilise une police système lisible.
Les couleurs restent génériques ou dérivées du rush. Les cadres 4:3 sont neutres, sur fond flouté ; aucune copie
de la barre Windows, du jaune ni des icônes 3D nostalgiques de la référence. Icônes génériques cohérentes, seulement
si elles illustrent une idée ; pas d'atomes pixel décoratifs par défaut.

## Mouvement : stable, zoom et flou

`motion.stable=true` par défaut : aucun tremblement, jitter, glitch, whip latéral ou clignotement automatique.
Les titres entrent par un petit zoom monotone (0,97 → 1) et une mise au point courte (4 → 0 px), sans déplacement
aléatoire. Les propositions utilisent des zooms doux (1,03 à 1,12) et du flou sur leur mouvement ; le texte reste net.
Le zoom du plan et le flou périphérique existants restent disponibles. Une animation historique agitée ne peut
revenir qu'avec une demande explicite et `motion.stable=false`, jamais dans une proposition de DA de zéro.

## Portée et personnalisation

Le défaut sert aussi de fondation aux nouveaux profils de DA créés de zéro. L'import d'une DA existante reste
indépendant. Les projets et profils déjà créés ne sont pas réécrits ; les réglages explicites d'un projet gardent
la priorité. Les règles envoyées à l'IA conservent ce squelette et la préférence sans tremblement.

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

Titre : Anton ou condensée équivalente, capitales, environ 108 px au maximum, ramené à la largeur et à la hauteur
disponibles (bande haute de la zone sûre). Liaison optionnelle `title.connector` : courte, serif italique, 62 % du
corps du titre. Sous-titres : Manrope ou sans-serif équivalente, semi-gras 600, environ 48 px à 1080 de large,
3 à 5 mots, sans rebond ; un seul mot en couleur au besoin. Couleurs génériques et contour adapté au fond.

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

La demande du créateur prime sur les anciennes bandes centrales : en 9:16, le titre se place au-dessus de la tête
dans le tiers haut et les sous-titres sous le visage dans le tiers bas. Les positions explicites des anciens
titres et sous-titres ne doivent pas ramener le texte sur le visage lorsque `textLayout=thirds` est actif.

| Élément (1080 × 1920) | Bande du groupe entier | Centre visé |
|---|---|---|
| Hook / titre condensé | y 106 à 576, adapté à la tête détectée | y 288 |
| Sous-titres compacts | y 1344 à 1632, sous le visage détecté | y 1459 |
| Derniers 15 % | réservés à l’interface de la plateforme | aucun texte |

Les groupes gardent leur hauteur complète dans ces bandes, pas seulement leur point d’ancrage. Le titre réduit
sa taille pour tenir au-dessus de la tête. Le calcul de lisibilité reste chargé de l’ombre, du contour ou de la
plaque. Les résultats d’un ancien cache ne peuvent pas déplacer les sous-titres hors de leur bande.

Lorsqu’un visage occupe toute une bande sans espace disponible, le texte concerné est masqué avec un avertissement
dans la timeline, plutôt que posé sur les yeux ou la bouche. L’aperçu utilise les visages du cache valide ; le rendu
et la préparation CapCut calculent la lisibilité si nécessaire. Un aperçu sans analyse utilise les bandes fixes.

Le mode `textLayout=free`, choisi volontairement dans l’inspecteur, respecte les positions manuelles. Déplacer,
redimensionner ou tourner un élément depuis l’inspecteur active ce mode pour la vidéo. Les réglages propres à la
vidéo restent au-dessus de la DA. En 16:9, la disposition du style reste utilisée.


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

**En place : le flou de périphérie.** Un calque au-dessus de la vidéo décodée (`backdrop-filter`, masque en ellipse
autour du visage à 1,35×, fondu de 180 px), sous tous les textes : la vidéo n'est pas décodée deux fois. Rayon de
1,2 px au repos à 2,2 px à la poussée de 1,2 %/s. Désactivé quand le visage dépasse 55 % de la hauteur, et sur un plan
où aucun visage n'est trouvé. Mesuré sur la prise de référence : le même temps de rendu avec et sans (21 s pour 6 s de
vidéo), les bords perdent 40 % de netteté, le visage n'en perd aucune.

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
| Sous-titre hors de sa bande | x 72–900, y 1344–1632 en 9:16 par défaut | en place ; titres en y 106–576 |
| Texte sur les yeux ou la bouche | aucune image | placement en place, test à faire |
| Contraste texte / fond réel | ≥ 4,5:1 | traitement en place, mesure du contraste rendu à faire |
| Coupe à l'intérieur d'un mot | aucune | en place : réparée avant le rendu (le clip qui tient la plus grande part du mot le garde entier) |
| Sous-titre sur plus de 2 lignes | aucun | en place |
| Image noire | aucune | en place |
| Familles typographiques | ≤ 2 | en place |
| Zones occupées en même temps, hors sous-titres | 1 | à faire |
| Contraste d'échelle, mode texte seul | ≥ 2,5:1 par carton | en place |

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

## Les formats et le mode texte seul (en place)

Le projet porte son format (`format` : `facecam` par défaut, `motion`, `tutorial`, `text`), choisi à la création.

| Format | Ce que le moteur fait de lui-même |
|---|---|
| Face caméra | Tout ce document : poussée, flou de périphérie, sous-titres placés autour du visage |
| Tuto | Pauses longues ramenées à 0,40 s au lieu de 0,25 s ; aucune poussée (on suit un geste à l'écran) |
| Motion design | Aucune poussée : le mouvement vient des graphismes |
| Texte seul | Des cartons à partir du script, sans rush ni voix |

**Le mode texte seul.** Une ligne du script, un carton ; la forme de la ligne choisit son archétype, les mots ne sont
jamais changés (seul le point final tombe, comme pour les sous-titres) :

| Archétype | Ligne qui le déclenche | Tailles |
|---|---|---|
| Affirmation | toute autre ligne | 92 px, quatre lignes au plus, réduite au besoin |
| Chiffre | commence par un nombre (`73 % ...`, `3x ...`) | chiffre 240 px en accent, label 36 px |
| Opposition | `A vs B`, `A contre B`, `A \| B` | deux fois 92 px, B en accent, filet d'accent entre les deux |
| Liste | `Titre :` puis des lignes `- ...`, quatre éléments au plus par carton | titre 92 px, éléments 36 px décalés de 60 ms |
| Citation | `« ... » - Source` | 72 px, barre d'accent de 6 px, source 28 px |
| Respiration | un seul mot | 140 px, encre sur papier : le seul carton qui retourne le fond |

Durée d'un carton : 0,35 s par mot + 0,6 s, entre 1,6 et 3,0 s. Entrée en 240 ms depuis 24 px plus bas
(cubic-bezier(0.33, 1, 0.68, 1)), sortie en 180 ms vers le haut, même axe ; le premier carton est là dès la première
image (la vidéo et sa miniature ne s'ouvrent jamais sur un fond vide). Ni image de banque, ni visuel généré. Tout tient
dans la zone sûre : ligne de 720 px centrée, bloc centré entre y 269 et 1248.

Le « rush » est un fond silencieux à l'encre du style, aussi long que les cartons, écrit là où l'analyse met une
prise : le rendu, le studio et CapCut le lisent comme les autres. Le test d'image noire ne s'applique pas à ce fond.

Les trois règles anti-diaporama : contraste d'échelle ≥ 2,5:1 entre les deux niveaux d'un carton (bloquant : le texte
trop long pour sa forme est nommé), jamais deux cartons du même archétype à la suite (avertissement), au moins une
respiration ou une opposition sur cinq cartons d'affilée (avertissement).

Dans le studio, un projet texte seul n'a que deux étapes : le script et ses cartons (bouton METTRE EN CARTONS après
chaque changement), puis la livraison. Côté Claude : `create_project` avec `video: "text"` et le script, `run cards`
pour remettre en cartons.

## Définir sa propre DA : le parcours guidé (en place)

Rien avant le run 1 : le parcours est proposé dans Livraison, après un export. Six étapes dans l'ordre d'impact
(accent, sous-titres, rythme, mouvement, typographie, interdits). À chaque étape, le moteur dit ce qu'il a dérivé et
pourquoi (« J'ai pris ce corail parce qu'il revient le plus dans ton décor »), puis trois options jouées 6 s sur la
vidéo du créateur ; l'accent accepte aussi une couleur libre. Chaque choix est enregistré tout de suite ; passer garde
le défaut. Plus proposé après trois vidéos sans étape franchie ; toujours accessible depuis la page Projets, qui
affiche les six lignes « dérivé » ou « défini par toi ».

La DA du créateur est une couche de style entre les défauts dérivés (dessous) et les réglages propres d'une vidéo
(dessus, ils l'emportent), plus les réglages du premier jet (pauses du rythme, densité des sous-titres). Les interdits
vont dans les règles qu'Adam apprend déjà.

ADAM a déjà deux mécanismes de goût, le dossier Inspiration et ses looks, et les règles apprises (Statistiques). Le
parcours guidé doit écrire dans les mêmes : un look pour l'accent, la typographie et le mouvement, des règles pour les
interdits. Pas un troisième stockage.

## Retiré de la v1

**Le rétroplanning** (heure de dépôt, régimes confortable / normal / serré). ADAM est un outil local : un run prend
quelques minutes sur la machine du créateur, qui peut relancer aussitôt. Il n'y a ni file d'attente ni heure de
livraison, et un régime qui dégrade la sortie selon l'horloge donnerait des vidéos différentes avec les mêmes rushes,
sans raison visible. Les contrôles à l'ingestion, eux, sont gardés.
