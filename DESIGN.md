# DESIGN.md — Charte UI/UX commune des applis Babahome

Version 0.1 — tirée de l'audit de KitchenCore (ui.html v0.10.x). S'applique à toutes les applis perso (KitchenCore, Sudoku, chaîne de cotes, futures add-ons HA).

**Règle d'or pour Claude Code : aucune valeur visuelle codée en dur.** Toute couleur, taille, rayon, ombre ou espacement passe par un token ci-dessous. Si un besoin n'est couvert par aucun token, on s'arrête et on demande avant d'en créer un.

## 1. Tokens

Bloc à copier tel quel en tête du style de chaque appli. Seule la couleur primaire change d'une appli à l'autre (`--c-primary*`).

```css
:root {
  /* Couleur d'identité de l'appli (KitchenCore = orange) */
  --c-primary:        #E8671A;
  --c-primary-strong: #C5560F;
  --c-primary-soft:   #FDF0E8;
  --c-on-primary:     #FFFFFF;

  /* Sémantique — identique dans toutes les applis */
  --c-success: #2E9D57;  --c-success-soft: #E6F4EA;
  --c-warning: #E08A00;  --c-warning-soft: #FEF3DC;
  --c-danger:  #D93A30;  --c-danger-soft:  #FCE8E6;
  --c-info:    #2F7BD8;  --c-info-soft:    #E3EEFB;

  /* Neutres */
  --c-bg:      #F5F5F5;
  --c-surface: #FFFFFF;
  --c-border:  #E0E0E0;
  --c-text:    #1A1A1A;
  --c-text-2:  #666666;
  --c-text-3:  #9E9E9E;
  --c-overlay: rgba(0,0,0,.45);

  /* Typographie */
  --font: 'Nunito', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --fs-xs: .75rem; --fs-sm: .875rem; --fs-md: 1rem;
  --fs-lg: 1.125rem; --fs-xl: 1.25rem; --fs-2xl: 1.5rem;
  --fw-regular: 600; --fw-bold: 700; --fw-heavy: 800;

  /* Espacements (pas de 4 px) */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px;

  /* Rayons */
  --r-sm: 8px; --r-md: 12px; --r-lg: 20px; --r-pill: 999px;

  /* Ombres */
  --shadow-0: 0 1px 4px rgba(0,0,0,.20);
  --shadow-primary:    0 4px 20px rgba(232,103,26,.5);
  --shadow-primary-sm: 0 2px 10px rgba(232,103,26,.4);
  --shadow-1: 0 2px 12px rgba(0,0,0,.10);
  --shadow-2: 0 8px 32px rgba(0,0,0,.15);

  /* Voiles clairs posés SUR une photo (badges, cases à cocher d'une vignette) */
  --c-scrim-light:      rgba(255,255,255,.90);
  --c-scrim-light-soft: rgba(255,255,255,.30);
  /* Fond d'une infobulle sombre */
  --c-scrim-dark:       rgba(30,30,30,.82);

  /* Types de repas (spécifique KitchenCore) */
  --c-meal-breakfast: #66BB6A;
  --c-meal-lunch:     #42A5F5;
  --c-meal-snack:     #AB47BC;

  /* Gabarits */
  --header-h: 60px; --bottom-h: 68px; --tap: 44px;
  --icon-sm: 18px; --icon-md: 22px; --icon-lg: 28px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --c-primary-soft: #3A2414;
    --c-bg: #121212; --c-surface: #1E1E1E; --c-border: #333333;
    --c-text: #EDEDED; --c-text-2: #A8A8A8; --c-text-3: #707070;
    --c-success-soft: #16301F; --c-warning-soft: #33280F;
    --c-danger-soft: #3A1715;  --c-info-soft: #14253A;
    --shadow-1: 0 2px 12px rgba(0,0,0,.40);
    --shadow-2: 0 8px 32px rgba(0,0,0,.55);
  }
}
```

Limites : 6 tailles de texte, 3 graisses, 4 rayons (+ cercle 50 %), 3 ombres. Pas d'exception.

Journal des ajouts : les trois `--c-meal-*` ont été ajoutés pendant l'étape 2/6 (page Menu). Vert, bleu et violet distinguent petit-déjeuner, déjeuner et goûter dans la timeline : ici **la couleur est l'information**, les fondre sur `--c-success` / `--c-info` ferait perdre la lecture d'un coup d'œil. Spécifique à KitchenCore, comme le jeu d'icônes de la section 2.

`--shadow-primary` / `--shadow-primary-sm` et `--c-scrim-dark` ont été ajoutés pendant l'étape 2/6 (page Recettes). La lueur orange du FAB est une ombre **colorée**, signature de l'app sur toutes les pages : la replier sur `--shadow-1` (gris neutre) la ferait disparaître partout, ce n'est pas une « différence mineure ». `--c-scrim-dark` sert au fond d'une infobulle : `--c-overlay` (45 %) laisserait transparaître le formulaire dessous et le texte blanc deviendrait illisible.

`--shadow-0` et les deux `--c-scrim-light*` ont été ajoutés à la v0.1 pendant l'étape 2/6 (page Stock). `--shadow-1` et ses 12 px de flou faisaient un halo sur les pastilles de 22 px et sur le curseur de niveau ; et un badge posé sur une photo doit rester blanc quelle que soit l'image dessous, donc il ne peut pas suivre `--c-surface`.

## 2. Icônes

- Aucun emoji dans l'interface : ni boutons, ni titres, ni onglets, ni états vides.
- Jeu unique : Material Design Icons (mdi), le même que Home Assistant.
- Intégration : sprite SVG en haut du body (`symbol id="i-delete"`…), utilisé via `svg class="icon"` + `use href="#i-delete"`. Pas de CDN : l'appli doit marcher hors ligne.
- **Un seul jeu, vraiment** : aucune icône n'est tracée à la main à côté du sprite. Un SVG écrit directement dans le balisage est un second jeu d'icônes qui dérive — c'est ainsi que le scan s'est retrouvé avec trois dessins différents.
- **Identifiants par le sens, pas par le nom de l'icône** : `i-delete` et non `i-delete-outline`, pour pouvoir changer d'icône sans toucher aux appels. Le sprite est généré depuis le paquet `@mdi/svg` et n'embarque **que** les icônes utilisées.
- **Ce qui n'est pas une icône** : un emoji choisi par l'utilisateur (icône d'un ingrédient, emoji d'un repas, d'un rayon, d'un marchand, d'une zone de stockage créée à la main) est une **donnée** et reste tel quel. Seules les valeurs par défaut livrées avec l'app peuvent devenir des icônes.
- **Limites où l'emoji reste**, et ce ne sont pas des oublis : une `<option>` de `<select>` n'accepte pas de SVG ; un `confirm()` natif et un texte copié dans le presse-papier non plus. Dans ces trois cas, on écrit du texte, pas du balisage.
- **Un emoji à l'intérieur d'une chaîne de libellé ne se remplace pas : il se supprime.** Le texte à côté porte déjà l'information, et faire transiter du HTML dans une variable texte est fragile.
- **Le HTML statique ne suffit pas** quand du JS redessine l'élément : `textContent` effacerait l'icône. Chercher les écritures à l'exécution (`textContent`, `innerText`) sur chaque page.
- **`${ico(...)}` exige un gabarit** (backticks). Dans une chaîne à apostrophes, il s'affiche tel quel — ou casse la syntaxe.
- Style : `.icon { width: var(--icon-md); height: var(--icon-md); fill: currentColor; flex-shrink: 0; }`. La couleur vient du texte parent.
- Une action = une icône, partout.
- **L'icône d'un bouton montre l'action qu'il déclenche, jamais l'état où l'on se trouve.** Un bouton qui ouvre l'édition porte le crayon ; celui qui enregistre porte la disquette.
- **`check` ne veut dire ni « modifier » ni « enregistrer ».** Il est réservé à cocher une sélection ou à confirmer un choix (appliquer un filtre, valider une sélection multiple). C'est l'échange de ces trois icônes qui a produit le défaut BL-210.

| Sens | Icône mdi |
| --- | --- |
| Ajouter | plus |
| Modifier | pencil |
| Supprimer | delete-outline |
| Fermer / annuler | close |
| Valider | check |
| Rechercher | magnify |
| Trier | sort |
| Filtrer | filter-variant |
| Plus d'options | dots-vertical |
| Favori off / on | heart-outline / heart |
| Toujours en cuisine | home-heart |
| Scanner | barcode-scan |
| Photo | camera-outline |
| Avertissement | alert-outline |
| Menu | menu |
| Retour | arrow-left |
| Enregistrer | content-save |
| Réinitialiser | restore |
| Retirer / moins | minus |
| Lier à un élément | link-variant |
| Pastille d'état | circle |
| Image | image-outline |
| Indéterminé | help-circle-outline |
| Lampe du scanner | flashlight |
| Changer de caméra | camera-flip-outline |
| Zones de stockage | archive-outline |

Spécifique KitchenCore : `home-outline` (**stock / Cuisine** : c'est le chez-soi, pas un carton), `package-variant` (catalogue produits), `cart-outline` (courses), `silverware-fork-knife` (recettes), `calendar-month-outline` (menu), `fridge-outline`, `snowflake` (congélateur), `cupboard-outline`.

## 3. Composants

On ne crée pas de nouvelle classe de bouton, de modale ou de carte par page. On réutilise ceux-ci, avec des modificateurs.

**Boutons** — une seule classe `.btn` + une variante :

- `.btn--primary` : un seul par écran ou par sheet, l'action principale.
- `.btn--secondary` (contour) : action alternative.
- `.btn--ghost` (texte seul) : annuler, actions tertiaires.
- `.btn--danger` : suppression définitive, toujours après confirmation.
- `.btn-icon` : bouton 44 × 44 avec icône seule et `aria-label`. La variante `--sm` garde une taille **visible** plus petite tout en conservant une **zone tactile** de 44 px, posée par un calque transparent centré.
- **Limite de la règle des 44 px** : dans une rangée serrée, trois zones de 44 px ne tiennent pas (une carte Stock fait 109 px de large) et se voleraient les appuis. Les commandes groupées `+ / −` gardent donc leur taille. Au-dessus d'elles se trouve la barre de niveau : agrandir leur zone vers le haut ramènerait le bug de suppression accidentelle corrigé en v0.10.278.
- Mise en page : `--block`, `--grow`, `--grow2` disent la place prise dans une rangée. C'est de la mise en page, pas de l'apparence.
- Hauteur 44 px, rayon `--r-md`, texte `--fs-md` / `--fw-bold`.
- Dans une sheet de confirmation : annuler à gauche (ghost), action à droite (primary ou danger).

**Supprimer** — une seule apparence, sur toutes les pages :

- **Dans une liste ou une carte** : `.btn-del`, posé sur `.btn-icon--round`. Au repos, **rigoureusement le même bouton que le « + » de sa ligne** — rond, même diamètre, fond `--c-surface`, bordure 1 px `--c-border`, icône `delete-outline` en `--c-text-2`, `aria-label` « Supprimer ». **À l'appui seulement**, bordure et icône passent à `--c-danger` ; le fond ne se remplit pas, alors que le « + » et le « − » se remplissent en `--c-primary`. **Pas de rouge permanent** : sur un écran dense, une action qui crie en rouge alors qu'elle n'est pas plus fréquente que les autres fatigue la lecture.
- **Une rangée d'actions = un seul composant.** `.btn-icon--round` porte toute l'apparence ; chaque rangée ne fixe que son diamètre via `--btn-round-size` (tuile Stock 20 px, carte Menu 24 px, ligne Courses 26 px, scanner 28 px), parce qu'une tuile serrée et une ligne de liste n'ont pas la même place. Aucun style propre à la poubelle en dehors de l'état appuyé.
- Le bouton « … » fait exception et garde son fond plein `--c-primary-soft` sans bordure : il n'agit pas sur la ligne, il ouvre un menu.
- **Dans une sheet ou un détail** : `.btn .btn--danger` avec un libellé explicite.
- **Place** : à droite de la ligne, **sauf** quand la poubelle remplace une autre commande (dans un sélecteur de quantité, elle prend la place du « moins » dès qu'on ne peut plus descendre). Là, c'est la même commande qui change de sens : la déplacer casserait le geste.
- **La croix ne supprime jamais.** `close` ferme ou annule ; supprimer, c'est `delete-outline`.

**Bottom sheet** — deux classes : `.sheet-overlay` (le voile, `--c-overlay`) et `.sheet` (la feuille : `--c-surface`, coins hauts `--r-lg`, poignée dessinée par le composant, safe-area réservée en bas). Fermée par **tap sur le voile**, **glissement vers le bas** et **Échap**. Pas de modale centrée sauf exception validée.
- **Le voile accepte `.on` comme `.open`** : les modales existantes utilisaient l'un ou l'autre, et les recabler n'apporterait rien.
- **Échap et le glissement simulent un clic sur le voile**, ce qui déclenche le gestionnaire que chaque modale porte déjà (`onclick="if(event.target===this)fermer()"`). Une nouvelle feuille hérite donc des trois gestes rien qu'en portant les deux classes et ce `onclick`.
- Le glissement ne démarre que si le contenu est **déjà en haut**, sinon on empêcherait de faire défiler la feuille.

**Carte** — `.card` : fond `--c-surface`, rayon `--r-md`, ombre `--shadow-1`, padding `--sp-4`.

**Chip / badge** — `.chip` : rayon `--r-pill`, `--fs-xs`, fond `*-soft`, texte de la couleur forte associée.

**Champ** — `.field` : hauteur 44 px, rayon `--r-sm`, bordure `--c-border`, focus `--c-primary`. Toujours un label visible ; le placeholder n'est pas un label.

**FAB** — un seul par écran, en bas à droite au-dessus de la bottom-nav.

## 4. Structure d'écran

- Header `--c-primary`, hauteur `--header-h`, titre `--fs-xl` / `--fw-heavy`.
- **Actions du header** : burger à gauche, tri / recherche / trois points à droite. Toutes sont le même bouton `.header-icon` — 44 × 44 px (`--tap`), rond, fond transparent, **icône du sprite en `--icon-md`**, couleur `--c-on-primary`, `aria-label` explicite. **Rien n'est dessiné à la main et rien n'est un caractère typographique** : un burger en trois `<span>` et un « ⋮ » rendu par la police n'ont aucune taille commune, c'est exactement ce qui les faisait paraître différents.
- **« Plus d'options », c'est `dots-vertical`, partout** — header, panneau, ligne de liste, carte. Jamais « ⋮ » ni « ••• » écrits en texte, ni la version horizontale de l'icône.
- Bottom-nav (hauteur `--bottom-h`), 3 à 5 entrées, icône + libellé court.
- **Couleurs de la bottom-nav** : onglet inactif = icône **et** libellé en `--c-text-3` ; onglet actif = icône et libellé en `--c-primary`, avec une pastille `--c-primary-soft` (rayon `--r-pill`, environ 56 × 32 px) derrière l'icône. **Aucune icône de la bottom-nav n'hérite de `--c-text`** : une barre d'icônes noires se lit comme une barre d'outils, pas comme une navigation.
- Seul le contenu défile.
- Respect des safe-areas (`env(safe-area-inset-*)`).

## 5. Règles UX

1. État vide : icône `--icon-lg` en `--c-text-3`, une phrase, et le bouton pour en sortir.
2. Suppression : confirmation en sheet, ou suppression immédiate + toast « Annuler » de 5 s. Jamais silencieuse.
3. Retour d'action : toast court au-dessus de la nav quand l'écran ne change pas visiblement.
4. Chargement : squelette ou indicateur local, jamais d'écran bloqué sans signe de vie.
5. Erreurs : langage clair, en `--c-danger`, à côté du champ, avec quoi faire.
6. Cibles tactiles : 44 × 44 px minimum, 8 px entre deux cibles.
7. Libellés : verbes d'action (« Ajouter au stock »), pas « OK ».
8. Couleur jamais seule : un statut a aussi une icône ou un texte.

## 6. Règles de code

- Pas d'attribut `style` sauf valeur réellement dynamique.
- Préfixe de classe par page (`.stk-`, `.crs-`, `.rcp-`, `.mnu-`) seulement pour la mise en page propre, jamais pour redéfinir un composant de la section 3.
- Police : Nunito embarquée (ou repli `system-ui`), pas d'appel à Google Fonts.
- Avant de livrer : aucune couleur hex hors `:root`, aucun emoji, aucune nouvelle classe `*-btn`, rendu correct en mode sombre.
