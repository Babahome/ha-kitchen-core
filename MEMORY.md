# Contexte de travail — KitchenCore

Ce fichier porte le contexte qui ne se devine ni dans le code ni dans l'historique git :
qui est l'auteur du projet, comment on déploie, où vit le backlog, ce que l'environnement
permet ou non de vérifier. Il est **suivi par git**, donc disponible dans n'importe quel
checkout — y compris une session Claude lancée dans le cloud depuis un ticket du backlog,
qui n'a accès ni aux mémoires locales de la machine de Baptiste ni à son Notion.

**À lire au début de toute session**, avec [CLAUDE.md](CLAUDE.md) (règles de code, historique
détaillé des versions) et [DESIGN.md](DESIGN.md) (charte visuelle, tokens CSS).

Dernière mise à jour : 30 octobre 2026 — v0.10.324.

---

## 1. Qui travaille sur ce projet

Baptiste, autodidacte, **pas développeur professionnel**. Toujours expliquer en termes simples
et expliciter le jargon. **Communication en français**, messages de commit compris.

C'est un projet personnel : l'add-on tourne chez lui, en production, pour sa famille. Le but à
long terme est de remplacer complètement Mealie. Il travaille sous Windows nativement (pas de
WSL). Un push n'est donc jamais anodin — voir §3.

---

## 2. Quels fichiers éditer

Le dépôt contient une copie de travail **non suivie** de l'add-on. Se tromper de chemin, c'est
modifier un fichier que GitHub ne verra jamais.

| Chemin | État |
|---|---|
| `kitchencore/ui.html` | **suivi** — c'est celui-ci qu'on édite |
| `kitchencore/server.js` | **suivi** |
| `kitchencore/config.yaml` | **suivi** — la version à bumper |
| `ha-kitchen-core/…` | ignoré (`.gitignore`) — ne jamais éditer seulement là |
| `EXPORTS/`, `Screenshot bug/` | ignorés (sauvegardes lourdes, captures) |

Erreur déjà commise en v0.9.41 : les changements avaient été appliqués sur
`ha-kitchen-core/kitchencore/ui.html`, donc perdus pour le déploiement.
**Avant toute édition, vérifier que le chemin commence par `kitchencore/`.**

Tout le code Node vit **directement dans `server.js`** : aucun sous-dossier, le container
Docker échoue à résoudre les modules rangés ailleurs.

---

## 3. Déployer = mettre en production

Home Assistant détecte une mise à jour en comparant le champ `version` de
`kitchencore/config.yaml`. Sans bump, rien ne se passe, même si le code a changé.

1. Modifier les fichiers sous `kitchencore/`
2. **Bumper `kitchencore/config.yaml`** (patch +0.0.1) — dans le même commit, et
   **à chaque commit**, y compris un fix mineur
3. `git push origin main` → déclenche le rebuild de l'image Docker
4. Côté HA : Paramètres → Modules complémentaires → KitchenCore → Reconstruire

**Un push part immédiatement en prod chez Baptiste.** C'est la raison pour laquelle l'autonomie
par défaut d'un ticket du backlog est « demander avant de pousser » (§4).

---

## 4. Le backlog vit dans Notion

Source de vérité : base Notion **« Backlog Claude Code »**
→ https://app.notion.com/p/eb1ffcb0a51547bcb83cc765636be82a

- Data source pour les requêtes : `collection://335b4ba5-aec4-4b64-953b-813f50f716a8`
- Filtrer sur `Projet = 'KitchenCore'`
- Champs : `Statut` (Inbox / Prêt / En cours / Bloqué / À valider / Terminé),
  `Priorité` (P0→P3), `Autonomie`, `Parallélisable`, `Dépend de` / `Bloque`, `Instructions`

**Sémantique de `Autonomie`** :

| Valeur | Ce que ça autorise |
|---|---|
| `Auto` | implémenter, commiter et pousser sans repasser par une validation |
| `PR à valider` *(défaut)* | implémenter, vérifier techniquement, puis **demander confirmation avant commit+push** |
| `Demander avant` | demander avant même de commencer |

**Ne jamais passer un ticket à `Terminé` de sa propre initiative.** Laisser `En cours` ou
`À valider` et attendre que Baptiste ait testé sur l'app réelle. Raison : un fix jugé correct
par relecture a déjà été marqué Terminé alors que le bug persistait en vrai — la vérification
statique ne remplace pas un test réel, et un backlog qui ment ne sert plus à rien.

La section « BACKLOG » en bas de `CLAUDE.md` est un **historique legacy**, plus mis à jour.
Ne pas s'y fier pour dire ce qui reste à faire.

---

## 5. Ce que l'environnement permet de vérifier — et ce qu'il ne permet pas

**Il n'y a pas de Node.js sur la machine de Baptiste** : le serveur ne tourne que dans le
container Docker de Home Assistant. On ne peut donc **pas** lancer l'app avec sa vraie base
depuis un poste de dev.

Ce qui reste faisable, et qui doit être fait avant d'annoncer qu'une feature marche :

- `node --check` sur le JavaScript extrait de `ui.html` (erreurs de syntaxe)
- compter les définitions de `switchPage` et `fabAction` : **exactement 1 chacune** (`grep`)
- valider une nouvelle page dans un fichier HTML isolé avant de l'intégrer
- appeler les routes de `server.js` sur l'instance en service, en lecture

Ce qui n'est pas vérifiable ici : le rendu sur le téléphone de Baptiste, les gestes tactiles,
la caméra, le comportement du clavier virtuel. **Dire ce qui a été mesuré et ce qui ne l'a pas
été**, plutôt que de présenter une relecture de code comme un test.

### Accès à l'app

| Accès | Contexte | Conséquences |
|---|---|---|
| ingress HA, `http://…:8080` | **non sécurisé** | pas de caméra, pas de service worker, pas de Wake Lock |
| `https://kitchencore.duckdns.org:8443` | sécurisé | tout fonctionne — **réseau local uniquement** |

Le HTTPS direct dépend de trois choses extérieures à l'add-on : le certificat DuckDNS dans
`/ssl/` (map `ssl:ro`), une réécriture DNS dans AdGuard sur TrueNAS (192.168.1.166) vers
192.168.1.123, et le DNS statique du téléphone Android pointant sur AdGuard. Hors WiFi
(4G/5G), le port 8443 n'est pas exposé : ça ne marche pas, et ce n'est pas un bug.

---

## 6. Réflexes de diagnostic

**« Je ne vois aucun changement après la mise à jour HA »** → ce n'est presque jamais le
déploiement. Vérifier d'abord ce que le serveur sert vraiment :

```bash
curl -sk https://kitchencore.duckdns.org:8443/ | grep -c "<marqueur de la feature>"
```

Si le marqueur est là, c'est le cache de Chrome Android. La version réelle s'affiche dans le
menu burger (`window._kcVersion`, lue depuis `config.yaml`) : c'est le moyen le plus rapide de
savoir si la page affichée est à jour. `GET /` renvoie `Cache-Control: no-cache` depuis
v0.10.249 — **ne jamais retirer ce header**.

**Chercher la cause racine avant de proposer un contournement.** Quand une fiche de bug liste
des correctifs « par ordre de simplicité » jusqu'à un « dernier recours », ne pas sauter au
dernier recours tant que le diagnostic n'est pas fini. Exemple : le gestionnaire de mots de
passe de Chrome s'activait sur un champ des Courses ; la vraie cause était un unique
`<input type="password">` ailleurs dans le document (le token Mealie). `ui.html` étant un
**document unique** où toutes les pages coexistent dans le DOM, un comportement qui semble
local peut venir de n'importe où dans la page — il n'y a ni `<form>` ni cloisonnement.

---

## 7. Base de données

La base vit dans le volume `/data` et **survit aux rebuilds Docker** : les anciens schémas
restent en place. `CREATE TABLE IF NOT EXISTS` ne modifie pas une table existante, donc
**toute nouvelle colonne passe par une migration idempotente** au démarrage de `server.js` :

```javascript
const migrations = [ ['table', 'colonne', 'TYPE REFERENCES…'] ];
migrations.forEach(([tbl, col, def]) => {
  const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tbl);
  if (!exists) return;
  const cols = db.prepare(`PRAGMA table_info(${tbl})`).all().map(c => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`);
});
```

Ne jamais supposer qu'une colonne existe. Le **fallback de `GET /api/ingredients`** (requête
sans les stats de stock quand le JOIN échoue sur un schéma ancien) est volontaire :
`no such column: p.ingredient_id` dans les logs est attendu sur une base legacy, non bloquant,
**et ce fallback ne doit pas être supprimé**.

**Rayons unifiés** (v0.9.67+) : un seul référentiel global `rayons`, partagé entre ingrédients
et marchands — ne jamais recréer une taxonomie par marchand. La propriété s'appelle `r.nom`,
pas `r.label` (vestige du système codé en dur). Un rayon se lie à un marchand via
`marchand_rayons`, et à un ingrédient via `ingredients.rayon_id`.

**`ingredients.categorie` est legacy** : elle ne sert plus qu'à une migration de démarrage qui
devine `rayon_id` par correspondance de nom. Le front n'utilise que `rayon_id`.

---

## 8. localStorage : une seule clé

| Clé | Rôle |
|---|---|
| `kc_scanner_camera` | deviceId de la caméra préférée du scanner |

C'est la **seule** clé active. Tout le reste a été migré en base : `kc_menu`, `kc_courses`,
`kc_cl_recipes` (v0.9.59–60), `kc_pantry` → `ingredients.toujours_dispo` (v0.10.280).

**Ne jamais remettre dans le localStorage une donnée qui décrit un ingrédient, un produit ou
une recette** : elle appartient à la base. Deux raisons apprises en v0.10.280 — le localStorage
est propre à un navigateur **et à une origine** (l'app s'ouvre tantôt par l'ingress, tantôt par
le HTTPS direct, donc deux stockages distincts sur le même téléphone), et une clé indexée par
nom ne retrouve pas la bonne ligne (« Sel fin » marqué depuis la fiche ne correspondait pas à
« sel » écrit dans une recette). Le localStorage ne convient qu'à une préférence réellement
locale à l'appareil, comme le choix de la caméra.

---

## 9. Import Mealie

Mealie tourne sur TrueNAS : `http://192.168.1.166:30111`. Authentification par **token Bearer**
(champ sous l'URL dans le modal d'import, saisi à chaque fois — rien n'est stocké).

Piège de l'API v1 : **`m.image` ne contient pas un chemin** mais souvent un jeton de
cache-busting (`23GB`, `kGfS`). Concaténé derrière l'URL de base, il donne une adresse morte.
Ne le traiter comme un chemin que s'il commence par `/` ou `http`, sinon construire l'URL
depuis l'UUID : `/api/media/recipes/{m.id}/images/original.webp`. Le téléchargement peut
exiger le token. L'import ne doit jamais échouer à cause d'une photo.

**Aucune photo n'est stockée en base64 dans la base** : tout data URI est décodé vers
`/data/photos/` et seule l'URL est conservée. Avant ce correctif, `GET /api/recettes` renvoyait
87,5 Mo pour 104 recettes. Ne jamais réintroduire de data URI dans `recettes.photo`.
