# Lancement public sur X

Matériel prêt à l'emploi pour ouvrir le compte : demandes d'images pour Codex, tweets, bio, fil d'accueil, captures.
Lien du jeu : https://tk757t.github.io/ (gratuit, navigateur mobile et ordinateur).

## 1. Demandes d'images pour Codex

Palette du jeu (source : `src/ui/kit/tokens.ts`) :

| Rôle | Hex |
|---|---|
| Fond bleu profond | `#0b1f55` |
| Fond bleu | `#12307a` |
| Bleu panneau | `#1d3f94` |
| Bleu clair (traits) | `#5b86e6` |
| Jaune bouton (accent principal) | `#ffcc1a` |
| Jaune bord / ombre | `#c98a00` |
| Or | `#ffd23f` |
| Rouge | `#d03a38` |
| Vert | `#17803a` |
| Orange usure | `#f2780c` |
| Cyan gemme | `#5fdcff` |
| Blanc | `#ffffff` |
| Gris clair (cases) | `#dfe5f1` |

### (a) Image de profil, 400 x 400 px

```
Crée une image de profil carrée de 400 x 400 pixels pour un jeu de navigateur appelé « 4 MULES ».

SUJET : une monoplace de course générique et inventée, vue de dessus, en gros plan, légèrement inclinée
(environ 30 degrés), au centre. Corps rouge #d03a38 avec une bande blanche, aileron avant et arrière jaunes
#ffcc1a, cockpit foncé, quatre pneus noirs bien visibles. Aucune marque, aucun logo, aucun numéro, aucun sponsor.

COMPOSITION : la voiture occupe environ 55 % de la largeur, parfaitement centrée. Tout ce qui compte doit tenir
dans un cercle de 300 px de diamètre centré (l'image sera rognée en cercle sur mobile). Derrière la voiture :
un grand dé blanc à 6 faces, stylisé, à moitié visible, en perspective, avec des points bleu foncé #0b1f55,
posé derrière la voiture pour évoquer « course au dé ». Quelques cases de piste (carrés gris clair #dfe5f1 en
damier discret) en arrière-plan.

TEXTE : « 4 MULES » en lettres capitales, police Lilita One (ou très proche), blanc #ffffff avec contour bleu
très foncé #0b1f55 et ombre portée jaune #c98a00, placé en bas, dans le cercle de sécurité. Seulement ces deux
mots, lisibles, sans faute d'orthographe. Si le texte est trop petit pour être lisible à 48 px, supprime-le et
laisse la voiture et le dé seuls.

STYLE : cartoon moderne, formes arrondies et épaisses, contours nets bleu foncé #0b1f55, aplats avec léger
dégradé et reflet blanc doux, ombre douce sous la voiture. Rendu propre de jeu mobile, très lisible en petit.

PALETTE : fond en dégradé radial de #1d3f94 (centre) vers #0b1f55 (bords) ; accents jaune #ffcc1a et or #ffd23f ;
rouge #d03a38 ; touches d'orange #f2780c ; blanc. Pas d'autres teintes dominantes.

AMBIANCE : énergique, joyeuse, un peu malicieuse ; on sent la tactique et le risque, pas la violence.

FORMAT : PNG 400 x 400, fond plein (pas de transparence), pas de bordure ni de cadre.

À NE PAS FAIRE :
- aucun logo, nom, numéro, drapeau ou sponsor réel ; aucune voiture reconnaissable d'une marque ou d'une écurie réelle
- pas de pilote ni de personnage humain, pas de visage
- pas de texte autre que « 4 MULES » ; pas de slogan, pas de petit texte
- pas de mulet ou autre animal (le nom est un clin d'œil, la voiture est le sujet)
- pas de réalisme photographique, pas de rendu 3D froid, pas de flou
- rien d'important près des bords ou des coins (zone rognée en cercle)
- pas de fumée, de flammes ou d'explosion qui noient la voiture
```

### (b) Bannière, 1500 x 500 px

```
Crée une bannière de 1500 x 500 pixels pour le compte X d'un jeu de navigateur appelé « 4 MULES ».

SUJET : un circuit de course vu de dessus, en forme d'anneau (ovale avec deux virages), fait de cases
carrées arrondies gris clair #dfe5f1 alignées en voies, avec des cases de virage orange #f2780c et quelques
cases rouges #d03a38. Sur ce circuit, 4 monoplaces génériques et inventées, vues de dessus, en pleine course :
une rouge #d03a38, une bleue #2468d8, une verte #17803a, une jaune #ffcc1a. Aucune marque, aucun numéro,
aucun sponsor.

COMPOSITION : scène large, de gauche à droite. Au centre et à droite, le circuit et les voitures en mouvement.
Deux ou trois dés blancs à 6 faces, stylisés, flottent au-dessus des voitures ; l'un d'eux porte un petit « 6 ».
Ajoute à droite de petits panneaux d'interface stylisés (jauges vertes pour pneus et freins, bouton jaune
vide, sans texte lisible). Laisse le tiers gauche très calme (fond uni ou presque), car la photo de profil la
recouvrira en bas à gauche.

TEXTE : « 4 MULES » seulement, grandes capitales, police Lilita One (ou très proche), blanc #ffffff, contour
bleu très foncé #0b1f55, ombre jaune #c98a00. Placé en haut à gauche ou au centre gauche, dans la zone
de sécurité, en dehors de la zone recouverte par l'avatar. Un seul exemplaire du texte, sans sous-titre,
sans slogan, sans faute.

ZONE DE SÉCURITÉ : garde l'essentiel (texte, voitures principales, dés) dans la bande centrale de
1200 x 300 px (x de 150 à 1350, y de 100 à 400). L'avatar de profil recouvre le coin bas-gauche (environ
x de 0 à 330, y de 280 à 500) : rien d'important dans ce coin. Les bords haut et bas peuvent être recadrés
selon l'appareil.

STYLE : cartoon moderne, formes épaisses et arrondies, contours nets bleu foncé #0b1f55, aplats avec léger
dégradé et reflets blancs doux, ombres douces. Rendu de jeu mobile, net et très lisible en petit.

PALETTE : fond dégradé de #12307a (centre) vers #0b1f55 (bords), détails de circuit en #1d3f94 et #5b86e6 ;
accents jaune #ffcc1a / or #ffd23f, rouge #d03a38, vert #17803a, orange #f2780c, cyan #5fdcff en touches
ponctuelles ; blanc.

AMBIANCE : dynamique, joyeuse, tactique ; l'idée « on pilote avec la tête » (dés, rapports, choix) plus que
la pure vitesse. Pas de violence.

FORMAT : PNG 1500 x 500, fond plein, pas de transparence, pas de cadre.

À NE PAS FAIRE :
- aucun logo, nom, numéro, drapeau, sponsor ou circuit réel ; aucune voiture reconnaissable d'une marque réelle
- pas de pilote ni de personnage humain
- pas de texte autre que « 4 MULES » (pas de slogan, pas d'adresse web, pas de petits caractères illisibles)
- pas de mulet ni d'animal
- rien d'important dans le coin bas-gauche ni collé aux bords haut et bas
- pas de réalisme photographique, pas de rendu 3D froid, pas de flou, pas d'effet de vitesse qui masque le circuit
- pas de capture d'écran réelle d'un autre jeu, pas de copie d'une illustration existante
```

## 2. Tweets de lancement (max 270 caractères, lien inclus)

**Variante A, l'accroche**

```
On ne pilote pas avec les pouces, mais avec la tête. 4 Mules : une course de voitures au tour par tour où chaque rapport de boîte lance son propre dé. Gratuit, sur mobile et ordinateur. https://tk757t.github.io/ #JeuVidéo #JeuNavigateur #IndieGame
```

**Variante B, le risque**

```
Un dé par rapport : le 1-2 de la première, le 21-30 de la sixième. Trop vite dans le virage, les pneus fondent. Trop prudent, les autres filent. 4 Mules est en ligne, gratuit, dans votre navigateur. https://tk757t.github.io/ #JeuVidéo #JeuNavigateur #IndieGame
```

**Variante C, les modes**

```
Nouveau jeu : 4 Mules ! On ne pilote pas avec les pouces, mais avec la tête. Solo contre l'IA, campagne à étoiles ou course en ligne. Parties de 5 minutes, gratuit, mobile et PC. Venez rouler ! https://tk757t.github.io/ #JeuVidéo #JeuNavigateur #IndieGame
```

Joindre une capture (section 4). Alternative de hashtags : `#JeuGratuit`, `#JeuMobile`, `#GameDev`.

## 3. Bio et fil de suivi

**Bio (max 160 caractères)**

```
4 Mules : course de voitures au tour par tour. Un dé par rapport, on pilote avec la tête. Gratuit, navigateur mobile et PC. Solo, campagne, en ligne. 👇
```

Lien du profil : https://tk757t.github.io/

**Tweet épinglé (fil de 4 tweets : accueil puis 3 numérotés)**

Tweet 1 (à épingler) :

```
Bienvenue sur 4 Mules, une course de voitures où l'on ne pilote pas avec les pouces, mais avec la tête. Gratuit, dans le navigateur, mobile ou ordinateur : https://tk757t.github.io/ Petit fil pour tout comprendre 🧵 #JeuVidéo #JeuNavigateur #IndieGame
```

Tweet 2, les règles :

```
1/ Les règles. À chaque tour, on choisit un rapport. Chaque rapport a son dé : du petit 1-2 de la première au 21-30 de la sixième. Les cases atteignables sont affichées avant de lancer. Virages, pneus, freins, pluie, stands : tout se gère. Environ 5 minutes par course.
```

Tweet 3, la progression :

```
2/ La progression. Or, gemmes, coffres, pièces de voiture, garage, quêtes et passe de saison de 30 paliers : tout se gagne en jouant, rien à payer. Campagne par niveaux et étoiles, course rapide contre l'IA ou en ligne.
```

Tweet 4, l'éditeur :

```
3/ L'éditeur de circuits est intégré : dessinez votre tracé, placez virages et zones, testez-le en simulation, puis lancez une course dessus. Dites-nous quel circuit vous voulez voir ! https://tk757t.github.io/
```


## 4. Captures à joindre

Captures mobile 390 x 844 choisies dans `e2e/screenshots/` (vérifiées visuellement) :

1. `e2e/screenshots/race4p-mobile-choose-destination.png` : la course à 4 voitures, avec l'aperçu des cases, les jauges
   (pneus, freins, boîte), le dé d20 et le message de météo. C'est la meilleure image pour illustrer « on pilote avec la
   tête ». À utiliser avec les variantes A, B et C.
2. `e2e/screenshots/campaign-mobile-map-progress.png` : la carte de campagne avec étoiles et circuit en vignette ; interface
   colorée, nette, qui montre la progression. À utiliser pour le tweet 3 du fil.
3. `e2e/screenshots/shop-mobile-daily.png` : la boutique avec offres du jour, onglets et monnaies ; montre l'économie
   par l'or et les gemmes. À utiliser avec le tweet sur le passe et la progression (vérifier avant d'envoyer que le texte
   « Or et gemmes se gagnent en course » reste bien lisible).

À éviter : `e2e/screenshots/track-mobile-overview.png` (circuit trop petit, interface de test non stylée).
Pour la bannière et le profil, les captures ne servent que de référence de couleurs et de style.
