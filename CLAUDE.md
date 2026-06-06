Projet : Add-on Home Assistant, Node.js + SQLite + ui.html single-file. GitHub public kitchencore-hassio/. Je suis autodidacte, pas développeur — toujours expliquer en termes simples.
Stack : Express port 8080, better-sqlite3, ZXing-js (scanner via CDN)
HTTPS direct port 8443 : cert DuckDNS /ssl/fullchain.pem + /ssl/privkey.pem (map ssl:ro). URL : https://kitchencore.duckdns.org:8443 — sans auth HA, caméra Android active. Réseau local uniquement (AdGuard TrueNAS 192.168.1.166 → DNS rewrite kitchencore.duckdns.org→192.168.1.123 + Android DNS statique 192.168.1.166).

Règles absolues (navigation cassée si non respectées)
switchPage et fabAction : exactement 1 définition chacune dans ui.html — ne jamais dupliquer, ne jamais redéfinir via override/alias. Pour ajouter un comportement : modifier la fonction existante directement en place.
Pour tout autre comportement à ajouter → modifier en place ou utiliser DOMContentLoaded + event listeners
Après chaque modification, vérifier avec grep que switchPage et fabAction ont exactement 1 définition chacune. (check_ui.js n'existe pas dans le projet — ne pas le chercher.)
Approche standalone : toujours valider une nouvelle page dans un fichier HTML isolé avant de l'intégrer dans ui.html
Tout le code Node.js directement dans server.js — jamais de sous-dossiers (Docker échoue à les résoudre)
Après chaque feature validée : bumper la version dans config.yaml (patch +0.0.1) puis git add + commit + push sur GitHub pour déclencher le rebuild Docker Home Assistant
Panels overlay (iOS Safari) : tout élément position:absolute;inset:0 (panel plein écran, modal) DOIT être enfant direct de .frame — jamais dans #content. Le #content a -webkit-overflow-scrolling:touch qui crée un stacking context isolé sur iOS : les z-index des enfants ne s'appliquent pas correctement, le header et la bottom-nav restent visibles par dessus.

Design : Police Nunito, --orange: #E8671A, --orange-l: #FDF0E8, --grey-l: #F5F5F5. Bottom nav 4 onglets, header orange, cards blanches fond gris clair. FAB orange bas droite, fab-search pill blanche bas gauche.

Pages — état v0.10.26
🏠 Stock : Grille produits par zone, branchée sur /api/stocks. Scanner ZXing-js (caméra via ingress HTTPS). Bouton + ouvre le scanner → détection code-barres → lookup /api/produits/barcode/:code → si trouvé : +1 stock ; si inconnu : panel création (#panel-new-produit, enfant direct de .frame).
  - Scanner : ZXing BrowserMultiFormatReader, bascule caméra par deviceId, bouton 🔄 masqué si 1 seule caméra.
  - Création produit : nom (obligatoire), marque (optionnel), zone (Frigo/Freezer/Placard), ingrédient associé (autocomplétion, optionnel). ingredient_id est nullable — un produit n'est pas forcément lié à un ingrédient de recette.
  - Stock affiché dynamiquement par zone via _stockLoad() / _stockRender(). Boutons +/− appellent /api/stocks/:id/ajouter et /api/stocks/:id/consommer.
  - Compatibilité DB legacy : HAS_ALIMENT_ID détecte l'ancienne colonne aliment_id. INSERT désactive FK temporairement (db.pragma foreign_keys OFF/ON). ingredient_id=NULL pour anciens produits — affichés via p.nom.
🍳 Recettes : Liste + filtres + recherche. Panels Détail (#panel-detail) et Édition (#panel-edit) enfants directs de .frame. Import Mealie (192.168.1.166:30111). Branché sur /api/recettes. saveRecette() est async et propage automatiquement les ingrédients en BDD.
  - Tags libres (v0.9.88) : table `tags` globale, chips de filtre dynamiques, création inline dans le panel édition, badges sur les cards. API : GET/POST /api/tags, DELETE /api/tags/:id. Tags stockés en JSON dans recettes.tags.
📅 Menu : Timeline −30j/+60j. Drag & drop. Branché API SQLite. Modal "Planifier un repas" (#m-modal) enfant direct de .frame.
🛒 Courses : Onglets dynamiques depuis page Marchands. Branché API SQLite. Menu ⋮ par item : "Créer comme ingrédient" lie l'item à un ingrédient officiel (nom/icone/rayon résolus dynamiquement via JOIN au chargement). courses_items.ingredient_id = FK vers ingredients.
🧅 Ingrédients : Gestion catalogue, fusion, rayons. Branché sur /api/ingredients. Fonctionnalités v0.9.37 :
  - Onglets : Tous / Sans rayon / Sans image / Sans recette / Doublons
  - Recettes liées : usedIn calculé depuis la BDD via GET /api/ingredients/usedIn. Panels détail/édition affichent les noms via _rv.
  - Sans image : détecte les ingrédients dont icone n'est pas une URL
  - Multiselection : bouton "Sélectionner" dans le header → coche des cards → menu ⋮ pour Supprimer / Changer rayon / Changer la saison / Fusionner (Fusionner visible seulement si ≥ 2 sélectionnés)
  - Création manuelle : barre de recherche (FAB bas gauche) → saisir un nom → bouton orange + toujours visible → crée via POST /api/ingredients. Aussi déclenchable par touche Entrée.
  - Panels Détail et Édition : plein écran, layout identique — header blanc (← | nom | action) + hero 16/9 + scroll (Nom, Rayon(s), Utilisé dans). Pas de système emoji — placeholder initiales (2 premières lettres) sur fond gris.
  - Upload photo : POST /api/ingredients/:id/photo (base64 → fichier /data/photos/). Colonne icone stocke soit une URL soit rien. Détection auto au chargement dans _ingLoadData.

Menu ⋮ header par page :
  - Recettes → ouvre le modal import Mealie/JSON
  - Menu planning (mode sélection) → actions sélection (courses, annuler)
  - Ingrédients → toujours accessible, affiche N sélectionnés + actions Supprimer/Rayon/Fusionner

BDD SQLite — tables : ingredients, produits, stocks, mouvements, unites, recettes, recette_ingredients, recette_etapes. Relation : produits.ingredient_id → ingredients (pas aliment_id).
Migrations schéma : le serveur lance des ALTER TABLE ADD COLUMN idempotents au démarrage (dans server.js après db.exec) pour gérer les DB existantes avec ancien schéma. Ne jamais supposer que les colonnes existent — utiliser CREATE TABLE IF NOT EXISTS + migrations.
Erreurs silencieuses : dans ui.html, toujours mettre _ingRender() HORS du try/catch de _ingLoadData() pour ne pas masquer les erreurs réseau derrière des erreurs de rendu.

Prochaines étapes : Afficher les produits déjà en stock quand on rescanne un produit connu (re-scan = +1 direct). Éventuellement : page détail produit, historique mouvements.

# BACKLOG — sujets en attente
Règle : dans une nouvelle conversation, Claude ajoute ici le sujet SANS toucher au code.
L'implémentation ne démarre que quand l'utilisateur dit explicitement "go" ou "commence".

- [x] Menu drag & drop : tempo 250ms pour éviter les drags non voulus (touch uniquement) — v0.9.77
- [x] Courses : lors d'une saisie manuelle, retrouver automatiquement l'ingrédient correspondant dans le catalogue (autocomplétion ou suggestion) — v0.9.79
- [x] Ingrédients : modifier la saison de plusieurs ingrédients en même temps (multiselection → changer saison) — v0.9.99
- [ ] Stock — Gestion des zones de stockage : table `zones_stock` en BDD (id, nom, emoji, ordre), API CRUD (GET/POST/PATCH/DELETE /api/zones-stock), page de gestion accessible depuis le menu ⋮ de la page Stock (ou page Paramètres), `STOCK_ZONES` chargé dynamiquement au lieu d'être hardcodé, filtres et boutons de création/déplacement mis à jour en conséquence. Migration avec les 3 zones par défaut (Frigo 🧊, Freezer ❄️, Placard 🚪).
- [ ] BDD — Lier recette_ingredients à ingredients via FK : ajouter colonne ingredient_id (nullable) dans recette_ingredients, migration de correspondance par nom, mise à jour UI éditeur de recette + page Ingrédients "Utilisé dans". Débloquera : recherche fiable des recettes par ingrédient, liste de courses auto.
