Projet : Add-on Home Assistant, Node.js + SQLite + ui.html single-file. GitHub public kitchencore-hassio/. Je suis autodidacte, pas développeur — toujours expliquer en termes simples.
Stack : Express port 8080, better-sqlite3, BarcodeDetector API

Règles absolues (navigation cassée si non respectées)
switchPage et fabAction : exactement 1 définition chacune dans ui.html — ne jamais dupliquer, ne jamais redéfinir via override/alias. Pour ajouter un comportement : modifier la fonction existante directement en place.
Pour tout autre comportement à ajouter → modifier en place ou utiliser DOMContentLoaded + event listeners
Après chaque modification, vérifier avec grep que switchPage et fabAction ont exactement 1 définition chacune. (check_ui.js n'existe pas dans le projet — ne pas le chercher.)
Approche standalone : toujours valider une nouvelle page dans un fichier HTML isolé avant de l'intégrer dans ui.html
Tout le code Node.js directement dans server.js — jamais de sous-dossiers (Docker échoue à les résoudre)
Après chaque feature validée : bumper la version dans config.yaml (patch +0.0.1) puis git add + commit + push sur GitHub pour déclencher le rebuild Docker Home Assistant

Design : Police Nunito, --orange: #E8671A, --orange-l: #FDF0E8, --grey-l: #F5F5F5. Bottom nav 4 onglets, header orange, cards blanches fond gris clair. FAB orange bas droite, fab-search pill blanche bas gauche.

Pages — état v0.9.32
🏠 Stock : Grille produits par zone. Scanner BarcodeDetector. Non branché sur l'API.
🍳 Recettes : Liste + filtres + recherche. Panels Détail et Édition. Import Mealie (192.168.1.123:30111). Branché sur /api/recettes. saveRecette() est async et propage automatiquement les ingrédients en BDD.
📅 Menu : Timeline −30j/+60j. Drag & drop. localStorage kc_menu. Non branché API.
🛒 Courses : 4 onglets marchands. Section recettes liées. localStorage kc_courses. Non branché API.
🧅 Ingrédients : Gestion catalogue, fusion, rayons. Branché sur /api/ingredients. Fonctionnalités v0.9.32 :
  - Onglets : Tous / Sans rayon / Sans image / Sans recette / Doublons
  - Recettes liées : usedIn peuplé au chargement depuis localStorage (matching par nom normalisé)
  - Sans image : détecte correctement les ingrédients avec seulement l'emoji défaut 🥫
  - Multiselection : bouton "Sélectionner" dans le header → coche des cards → menu ⋮ pour Supprimer / Changer rayon / Fusionner (Fusionner visible seulement si ≥ 2 sélectionnés)
  - Création manuelle : barre de recherche (FAB bas gauche) → saisir un nom → bouton orange + toujours visible → crée via POST /api/ingredients. Aussi déclenchable par touche Entrée.

Menu ⋮ header par page :
  - Recettes → ouvre le modal import Mealie/JSON
  - Menu planning (mode sélection) → actions sélection (courses, annuler)
  - Ingrédients → toujours accessible, affiche N sélectionnés + actions Supprimer/Rayon/Fusionner

BDD SQLite — tables : ingredients, produits, stocks, mouvements, unites, recettes, recette_ingredients, recette_etapes. Relation : produits.ingredient_id → ingredients (pas aliment_id).
Migrations schéma : le serveur lance des ALTER TABLE ADD COLUMN idempotents au démarrage (dans server.js après db.exec) pour gérer les DB existantes avec ancien schéma. Ne jamais supposer que les colonnes existent — utiliser CREATE TABLE IF NOT EXISTS + migrations.
Erreurs silencieuses : dans ui.html, toujours mettre _ingRender() HORS du try/catch de _ingLoadData() pour ne pas masquer les erreurs réseau derrière des erreurs de rendu.

Prochaines étapes : Supprimer les console.log [ING] de debug (ajoutés en v0.9.15, plus nécessaires). Brancher Stock sur API, formulaire création produit, brancher Menu et Courses sur API.
