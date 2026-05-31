/**
 * KitchenCore v0.9 – Interface mobile avancée
 * Recettes, ingrédients, stocks, produits, IoT
 */
'use strict';

const express  = require('express');
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = parseInt(process.env.INGRESS_PORT || process.env.PORT || '8080', 10);

const DATA_DIR   = process.env.DATA_PATH || '/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'kitchencore.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ══════════════════════════════════════════════════════════════════════════════
// SCHÉMA
// ══════════════════════════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS ingredients (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nom          TEXT NOT NULL UNIQUE,
    categorie    TEXT DEFAULT 'Autre',
    seuil_alerte REAL DEFAULT 1,
    icone        TEXT DEFAULT '🥫',
    created_at   TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS produits (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    nom           TEXT NOT NULL,
    marque        TEXT,
    code_barres   TEXT UNIQUE,
    contenance    REAL DEFAULT 1,
    unite         TEXT DEFAULT 'unité',
    created_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS stocks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    produit_id    INTEGER NOT NULL UNIQUE REFERENCES produits(id),
    packs_pleins  INTEGER DEFAULT 0,
    unites_ouvert INTEGER DEFAULT 0,
    zone          TEXT DEFAULT 'Frigo',
    updated_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS mouvements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    produit_id INTEGER NOT NULL,
    type       TEXT NOT NULL,
    delta      INTEGER DEFAULT 0,
    source     TEXT DEFAULT 'web',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS unites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS recettes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nom            TEXT NOT NULL,
    emoji          TEXT DEFAULT '🍽️',
    photo          TEXT DEFAULT '',
    description    TEXT DEFAULT '',
    portions       INTEGER DEFAULT 2,
    temps_prep     INTEGER DEFAULT 0,
    temps_cuisson  INTEGER DEFAULT 0,
    tags           TEXT DEFAULT '[]',
    favori         INTEGER DEFAULT 0,
    note           REAL DEFAULT 0,
    source         TEXT DEFAULT '',
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS recette_ingredients (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    recette_id       INTEGER NOT NULL REFERENCES recettes(id) ON DELETE CASCADE,
    position         INTEGER DEFAULT 0,
    type             TEXT DEFAULT 'ingredient',
    nom              TEXT NOT NULL,
    qty              TEXT DEFAULT '',
    unite            TEXT DEFAULT '',
    sous_recette_id  INTEGER REFERENCES recettes(id) ON DELETE SET NULL,
    note             TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS recette_etapes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recette_id INTEGER NOT NULL REFERENCES recettes(id) ON DELETE CASCADE,
    position   INTEGER DEFAULT 0,
    titre      TEXT DEFAULT '',
    texte      TEXT NOT NULL,
    timer      INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS menu (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    date     TEXT NOT NULL,
    nom      TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'n',
    portions INTEGER DEFAULT 2,
    emoji    TEXT DEFAULT '🍽️',
    note     TEXT DEFAULT '',
    photo    TEXT
  );
  CREATE TABLE IF NOT EXISTS courses_items (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nom       TEXT NOT NULL,
    icone     TEXT,
    marchand  TEXT NOT NULL DEFAULT 'drive',
    rayon     TEXT DEFAULT 'Autre',
    qty       REAL DEFAULT 1,
    unite     TEXT DEFAULT '',
    done      INTEGER DEFAULT 0,
    origin    TEXT DEFAULT 'manuel',
    recipe_id TEXT
  );
  CREATE TABLE IF NOT EXISTS courses_recipes (
    recipe_id TEXT PRIMARY KEY,
    nom       TEXT NOT NULL,
    photo     TEXT,
    portions  INTEGER DEFAULT 2
  );
  CREATE TABLE IF NOT EXISTS marchands (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    nom      TEXT NOT NULL,
    emoji    TEXT DEFAULT '🏪',
    image    TEXT,
    position INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS rayons (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    nom   TEXT NOT NULL UNIQUE,
    emoji TEXT DEFAULT '📦'
  );
  CREATE TABLE IF NOT EXISTS marchand_rayons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    marchand_id INTEGER NOT NULL REFERENCES marchands(id) ON DELETE CASCADE,
    rayon_id    INTEGER NOT NULL REFERENCES rayons(id) ON DELETE CASCADE,
    position    INTEGER DEFAULT 0,
    UNIQUE(marchand_id, rayon_id)
  );
  CREATE TABLE IF NOT EXISTS tags (
    id  INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS suggestion_rules (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL DEFAULT 'Règle',
    active     INTEGER DEFAULT 1,
    days       TEXT DEFAULT '[]',
    meals      TEXT DEFAULT '[]',
    conditions TEXT DEFAULT '[]',
    position   INTEGER DEFAULT 0
  );
`);

// Migrations : ajout de colonnes manquantes sur DB existantes (idempotent)
[
  ['stocks',      'packs_pleins',  'INTEGER DEFAULT 0'],
  ['stocks',      'unites_ouvert', 'INTEGER DEFAULT 0'],
  ['stocks',      'zone',          "TEXT DEFAULT 'Frigo'"],
  ['stocks',      'updated_at',    "TEXT DEFAULT (datetime('now'))"],
  ['produits',    'contenance',    'REAL DEFAULT 1'],
  ['produits',    'unite',         "TEXT DEFAULT 'unité'"],
  ['ingredients', 'seuil_alerte',  'REAL DEFAULT 1'],
  ['ingredients', 'icone',         "TEXT DEFAULT '🥫'"],
  ['ingredients', 'created_at',    "TEXT DEFAULT (datetime('now'))"],
  ['recettes',    'source',        "TEXT DEFAULT ''"],
  ['recettes',    'updated_at',    "TEXT DEFAULT (datetime('now'))"],
  ['recette_ingredients', 'note',  "TEXT DEFAULT ''"],
  ['ingredients',    'rayon_id',      'INTEGER REFERENCES rayons(id)'],
  ['ingredients',    'saison',        "TEXT DEFAULT '[]'"],
  ['menu',           'position',      'INTEGER DEFAULT 0'],
  ['courses_items',  'ingredient_id', 'INTEGER REFERENCES ingredients(id)'],
  ['marchands',      'search_url',    "TEXT DEFAULT ''"],
].forEach(([table, col, def]) => {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch(_) {}
});

// Migration : ancienne table marchands_rayons → rayons + marchand_rayons (jonction)
if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='marchands_rayons'").get()) {
  db.exec(`INSERT OR IGNORE INTO rayons(nom,emoji) SELECT DISTINCT nom,emoji FROM marchands_rayons`);
  db.exec(`INSERT OR IGNORE INTO marchand_rayons(marchand_id,rayon_id,position)
    SELECT mr.marchand_id,r.id,mr.position FROM marchands_rayons mr
    JOIN rayons r ON LOWER(TRIM(r.nom))=LOWER(TRIM(mr.nom))`);
  db.exec(`DROP TABLE marchands_rayons`);
}

// Seed rayons par défaut si la table est vide
if (db.prepare('SELECT COUNT(*) as n FROM rayons').get().n === 0) {
  const ins = db.prepare('INSERT OR IGNORE INTO rayons(nom,emoji) VALUES(?,?)');
  [
    ['Fruits et Légumes','🥦'],['Viandes et Poissons','🥩'],
    ['Crèmerie et Produits laitiers','🥛'],['Charcuterie et Traiteur','🧂'],
    ['Surgelés','❄️'],['Épicerie sucrée','🍫'],['Épicerie salée','🫙'],
    ['Boissons','🧃'],['Pains et Pâtisseries','🍞'],['Bio et Écologie','🫒'],
    ['Entretien et Nettoyage','🧴'],['Hygiène et Beauté','🍷'],['Autre','📦'],
  ].forEach(([n,e]) => ins.run(n,e));
}

// Migration : mapper ingredients.categorie → rayon_id (correspondance par nom)
db.exec(`UPDATE ingredients SET rayon_id=(
  SELECT id FROM rayons WHERE LOWER(TRIM(nom))=LOWER(TRIM(ingredients.categorie)) LIMIT 1
) WHERE rayon_id IS NULL AND categorie IS NOT NULL AND categorie!=''`);

// Seed tags : récupère les tags des recettes existantes + liste de base
{
  const n = db.prepare('SELECT COUNT(*) as n FROM tags').get().n;
  if (n === 0) {
    const base = ['soupe','tarte','onepot','diner','dessert','rapide','veggie','déjeuner','petit-déj'];
    const all  = new Set(base);
    try {
      db.prepare("SELECT tags FROM recettes WHERE tags IS NOT NULL AND tags != '[]'").all()
        .forEach(r => {
          try { JSON.parse(r.tags||'[]').forEach(t => { if(t) all.add(t.trim().toLowerCase()); }); }
          catch(_) {}
        });
    } catch(_) {}
    const ins = db.prepare('INSERT OR IGNORE INTO tags(nom) VALUES(?)');
    all.forEach(nom => { if(nom) ins.run(nom); });
  }
}

// Seed unités de base si vide
if (db.prepare('SELECT COUNT(*) as n FROM unites').get().n === 0) {
  const ins = db.prepare('INSERT OR IGNORE INTO unites(label) VALUES(?)');
  ['g','kg','ml','cl','L','pièce','c.à.c','c.à.s','pincée','bouquet','sachet','tranche','gousse','brin','boîte','paquet']
    .forEach(u => ins.run(u));
}

app.use(express.json({ limit: '10mb' }));
app.use('/photos', express.static(PHOTOS_DIR));
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

// ── UI ────────────────────────────────────────────────────────────────────────
const HTML = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
app.get('/',       (_req, res) => res.send(HTML));
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '0.9.0' }));

// ══════════════════════════════════════════════════════════════════════════════
// INGRÉDIENTS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/ingredients', (_req, res) => {
  try {
    res.json(db.prepare(`
      SELECT a.*, COUNT(DISTINCT p.id) AS nb_produits,
        COALESCE(SUM((s.packs_pleins*p.contenance)+s.unites_ouvert),0) AS stock_total
      FROM ingredients a
      LEFT JOIN produits p ON p.ingredient_id=a.id
      LEFT JOIN stocks   s ON s.produit_id=p.id
      GROUP BY a.id ORDER BY a.categorie,a.nom
    `).all());
  } catch(e) {
    console.error('[API] GET /api/ingredients error:', e.message);
    // Fallback : retourner les ingrédients sans les stats stock (schéma DB potentiellement ancien)
    try {
      res.json(db.prepare('SELECT * FROM ingredients ORDER BY categorie,nom').all());
    } catch(e2) {
      res.status(500).json({ error: e.message });
    }
  }
});

app.post('/api/ingredients', (req, res) => {
  const { nom, categorie='Autre', seuil_alerte=1, icone='🥫' } = req.body;
  if (!nom) return res.status(400).json({ error: 'nom requis' });
  try {
    const i = db.prepare('INSERT INTO ingredients(nom,categorie,seuil_alerte,icone) VALUES(?,?,?,?)').run(nom.trim(), categorie, seuil_alerte, icone);
    res.status(201).json(db.prepare('SELECT * FROM ingredients WHERE id=?').get(i.lastInsertRowid));
  } catch(e) {
    res.status(e.message.includes('UNIQUE') ? 409 : 500).json({ error: e.message.includes('UNIQUE') ? 'Ingrédient déjà existant.' : e.message });
  }
});

app.patch('/api/ingredients/:id', (req, res) => {
  const f=[], v=[];
  ['nom','categorie','rayon_id','seuil_alerte','icone','saison'].forEach(k => { if (req.body[k] !== undefined) { f.push(k+'=?'); v.push(req.body[k]); } });
  if (!f.length) return res.status(400).json({ error: 'Rien à modifier' });
  v.push(req.params.id);
  db.prepare(`UPDATE ingredients SET ${f.join(',')} WHERE id=?`).run(...v);
  res.json(db.prepare('SELECT * FROM ingredients WHERE id=?').get(req.params.id));
});

app.post('/api/ingredients/:id/photo', (req, res) => {
  const { base64, mime } = req.body;
  if (!base64 || !mime) return res.status(400).json({ error: 'base64 et mime requis' });
  const ext = (mime.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '');
  const filename = `ing_${req.params.id}_${Date.now()}.${ext}`;
  const filepath = path.join(PHOTOS_DIR, filename);
  try {
    fs.writeFileSync(filepath, Buffer.from(base64, 'base64'));
    const url = `/photos/${filename}`;
    db.prepare('UPDATE ingredients SET icone=? WHERE id=?').run(url, req.params.id);
    res.json({ url });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ingredients/:id', (req, res) => {
  try {
    const n = db.prepare('SELECT COUNT(*) as n FROM produits WHERE ingredient_id=?').get(req.params.id).n;
    if (n > 0) return res.status(409).json({ error: `${n} produit(s) lié(s)` });
  } catch(_) {}
  db.prepare('DELETE FROM ingredients WHERE id=?').run(req.params.id);
  res.status(204).end();
});

app.post('/api/ingredients/merge', (req, res) => {
  const { keep_id, merge_ids, name } = req.body;
  if (!keep_id || !name || !Array.isArray(merge_ids))
    return res.status(400).json({ error: 'keep_id, name et merge_ids requis' });

  const doMerge = db.transaction(() => {
    const kept = db.prepare('SELECT nom FROM ingredients WHERE id=?').get(keep_id);
    db.prepare('UPDATE ingredients SET nom=? WHERE id=?').run(name, keep_id);
    if (kept && kept.nom !== name) {
      db.prepare('UPDATE recette_ingredients SET nom=? WHERE nom=?').run(name, kept.nom);
    }
    for (const id of merge_ids) {
      const ing = db.prepare('SELECT nom FROM ingredients WHERE id=?').get(id);
      if (!ing) continue;
      db.prepare('UPDATE recette_ingredients SET nom=? WHERE nom=?').run(name, ing.nom);
      try { db.prepare('UPDATE produits SET ingredient_id=? WHERE ingredient_id=?').run(keep_id, id); } catch(_) {}
      db.prepare('DELETE FROM ingredients WHERE id=?').run(id);
    }
  });

  try {
    doMerge();
    res.json(db.prepare('SELECT * FROM ingredients WHERE id=?').get(keep_id));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// FIX #5 — Route search ajoutée (manquait, utilisée par l'autocomplétion recettes)
app.get('/api/ingredients/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  res.json(db.prepare(
    `SELECT i.id, i.nom, i.categorie, i.icone, r.nom AS rayon_nom
     FROM ingredients i
     LEFT JOIN rayons r ON r.id = i.rayon_id
     WHERE i.nom LIKE ? ORDER BY i.nom LIMIT 8`
  ).all(`%${q}%`));
});

// Auto-ajout transparent d'un ingrédient (appelé depuis saveIngredients)
app.post('/api/ingredients/auto-add', (req, res) => {
  const { nom } = req.body;
  if (!nom?.trim()) return res.status(400).json({ error: 'nom requis' });
  const existing = db.prepare('SELECT * FROM ingredients WHERE LOWER(nom)=LOWER(?)').get(nom.trim());
  if (existing) return res.json(existing);
  try {
    const i = db.prepare('INSERT INTO ingredients(nom,categorie,seuil_alerte,icone) VALUES(?,?,?,?)').run(nom.trim(), 'Autre', 1, '🥫');
    res.status(201).json(db.prepare('SELECT * FROM ingredients WHERE id=?').get(i.lastInsertRowid));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PRODUITS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/produits', (_req, res) => {
  // FIX #1 — aliments → ingredients, aliment_id → ingredient_id
  res.json(db.prepare(`
    SELECT p.*, a.nom AS ingredient_nom, a.icone, a.seuil_alerte,
           s.packs_pleins, s.unites_ouvert, s.zone,
           ((COALESCE(s.packs_pleins,0)*p.contenance)+COALESCE(s.unites_ouvert,0)) AS total_unites
    FROM produits p JOIN ingredients a ON a.id=p.ingredient_id
    LEFT JOIN stocks s ON s.produit_id=p.id
    ORDER BY s.zone,a.nom,p.nom
  `).all());
});

app.get('/api/produits/barcode/:code', (req, res) => {
  // FIX #2 — aliments → ingredients, aliment_id → ingredient_id
  const row = db.prepare(`
    SELECT p.*, a.nom AS ingredient_nom, a.icone, a.seuil_alerte, s.packs_pleins, s.unites_ouvert, s.zone
    FROM produits p JOIN ingredients a ON a.id=p.ingredient_id LEFT JOIN stocks s ON s.produit_id=p.id
    WHERE p.code_barres=?
  `).get(req.params.code);
  if (!row) return res.status(404).json({ error: 'Code-barres inconnu', code: req.params.code });
  res.json(row);
});

app.post('/api/produits', (req, res) => {
  const { ingredient_id, nom, marque, code_barres, contenance=1, unite='unité', zone='Frigo' } = req.body;
  if (!ingredient_id || !nom) return res.status(400).json({ error: 'ingredient_id et nom requis' });
  try {
    const i = db.prepare('INSERT INTO produits(ingredient_id,nom,marque,code_barres,contenance,unite) VALUES(?,?,?,?,?,?)').run(ingredient_id, nom.trim(), marque||null, code_barres||null, contenance, unite);
    db.prepare('INSERT INTO stocks(produit_id,zone) VALUES(?,?)').run(i.lastInsertRowid, zone);
    res.status(201).json(db.prepare('SELECT * FROM produits WHERE id=?').get(i.lastInsertRowid));
  } catch(e) {
    res.status(e.message.includes('UNIQUE') ? 409 : 500).json({ error: e.message.includes('UNIQUE') ? 'Code-barres déjà utilisé' : e.message });
  }
});

app.patch('/api/produits/:id', (req, res) => {
  const f=[], v=[];
  ['nom','marque','code_barres','contenance','unite'].forEach(k => { if (req.body[k] !== undefined) { f.push(k+'=?'); v.push(req.body[k]); } });
  if (!f.length) return res.status(400).json({ error: 'Rien à modifier' });
  v.push(req.params.id);
  try {
    db.prepare(`UPDATE produits SET ${f.join(',')} WHERE id=?`).run(...v);
    res.json(db.prepare('SELECT * FROM produits WHERE id=?').get(req.params.id));
  } catch(e) { res.status(409).json({ error: 'Code-barres déjà utilisé' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// STOCKS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/stocks', (_req, res) => {
  // FIX #3 — aliments → ingredients, aliment_id → ingredient_id
  res.json(db.prepare(`
    SELECT s.*, p.nom AS produit_nom, p.contenance, p.unite, p.code_barres,
           a.nom AS ingredient_nom, a.icone, a.seuil_alerte, a.categorie,
           ((s.packs_pleins*p.contenance)+s.unites_ouvert) AS total_unites
    FROM stocks s JOIN produits p ON p.id=s.produit_id JOIN ingredients a ON a.id=p.ingredient_id
    ORDER BY s.zone,a.nom
  `).all());
});

app.post('/api/stocks/:id/ajouter', (req, res) => {
  const { packs=0, unites=0, zone } = req.body; const { id } = req.params;
  const s=['packs_pleins=MAX(0,packs_pleins+?)','unites_ouvert=MAX(0,unites_ouvert+?)',"updated_at=datetime('now')"], v=[+packs,+unites];
  if (zone) { s.push('zone=?'); v.push(zone); } v.push(id);
  db.prepare(`UPDATE stocks SET ${s.join(',')} WHERE produit_id=?`).run(...v);
  const d = +packs+(+unites);
  if (d !== 0) db.prepare("INSERT INTO mouvements(produit_id,type,delta,source) VALUES(?,'ajout',?,'web')").run(id, d);
  res.json(db.prepare('SELECT * FROM stocks WHERE produit_id=?').get(id));
});

app.post('/api/stocks/:id/consommer', (req, res) => {
  const { id } = req.params; const src = req.body.source || 'web';
  const p = db.prepare('SELECT p.contenance,s.packs_pleins,s.unites_ouvert FROM produits p JOIN stocks s ON s.produit_id=p.id WHERE p.id=?').get(id);
  if (!p) return res.status(404).json({ error: 'Introuvable' });
  let { packs_pleins, unites_ouvert, contenance } = p; let pd = false;
  unites_ouvert -= 1;
  if (unites_ouvert < 0) {
    if (packs_pleins <= 0) return res.status(422).json({ error: 'Stock vide' });
    packs_pleins--; unites_ouvert += contenance; pd = true;
  }
  db.prepare("UPDATE stocks SET packs_pleins=?,unites_ouvert=?,updated_at=datetime('now') WHERE produit_id=?").run(packs_pleins, unites_ouvert, id);
  db.prepare("INSERT INTO mouvements(produit_id,type,delta,source) VALUES(?,'consommation',-1,?)").run(id, src);
  res.json({ stock: db.prepare('SELECT * FROM stocks WHERE produit_id=?').get(id), pack_deballe: pd });
});

app.post('/api/stocks/:id/corriger', (req, res) => {
  const { packs_pleins=0, unites_ouvert=0, zone } = req.body; const { id } = req.params;
  const s=['packs_pleins=?','unites_ouvert=?',"updated_at=datetime('now')"], v=[+packs_pleins,+unites_ouvert];
  if (zone) { s.push('zone=?'); v.push(zone); } v.push(id);
  db.prepare(`UPDATE stocks SET ${s.join(',')} WHERE produit_id=?`).run(...v);
  db.prepare("INSERT INTO mouvements(produit_id,type,delta,source) VALUES(?,'correction',0,'web')").run(id);
  res.json(db.prepare('SELECT * FROM stocks WHERE produit_id=?').get(id));
});

// ══════════════════════════════════════════════════════════════════════════════
// IOT
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/iot/scan', (req, res) => {
  const { code_barres } = req.body;
  if (!code_barres) return res.status(400).json({ error: 'code_barres requis' });
  const p = db.prepare('SELECT p.*,s.packs_pleins,s.unites_ouvert,s.zone FROM produits p LEFT JOIN stocks s ON s.produit_id=p.id WHERE p.code_barres=?').get(code_barres);
  if (!p) return res.status(404).json({ error: 'Code-barres inconnu', code_barres });
  let { packs_pleins, unites_ouvert, contenance } = p; let pd = false;
  unites_ouvert -= 1;
  if (unites_ouvert < 0) {
    if (packs_pleins <= 0) return res.status(422).json({ error: 'Stock vide', produit_nom: p.nom });
    packs_pleins--; unites_ouvert += contenance; pd = true;
  }
  db.prepare("UPDATE stocks SET packs_pleins=?,unites_ouvert=?,updated_at=datetime('now') WHERE produit_id=?").run(packs_pleins, unites_ouvert, p.id);
  db.prepare("INSERT INTO mouvements(produit_id,type,delta,source) VALUES(?,'consommation',-1,'iot')").run(p.id);
  res.json({ ok: true, produit_nom: p.nom, packs_pleins, unites_ouvert, pack_deballe: pd, zone: p.zone });
});

// ══════════════════════════════════════════════════════════════════════════════
// MOUVEMENTS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/mouvements', (_req, res) => {
  // FIX #4 — aliments → ingredients, aliment_id → ingredient_id
  res.json(db.prepare(`
    SELECT m.*, p.nom AS produit_nom, a.icone
    FROM mouvements m JOIN produits p ON p.id=m.produit_id JOIN ingredients a ON a.id=p.ingredient_id
    ORDER BY m.created_at DESC LIMIT 100
  `).all());
});

// ══════════════════════════════════════════════════════════════════════════════
// UNITÉS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/unites', (_req, res) => {
  res.json(db.prepare('SELECT * FROM unites ORDER BY label').all());
});
app.post('/api/unites', (req, res) => {
  const { label } = req.body;
  if (!label?.trim()) return res.status(400).json({ error: 'label requis' });
  try {
    const i = db.prepare('INSERT INTO unites(label) VALUES(?)').run(label.trim());
    res.status(201).json(db.prepare('SELECT * FROM unites WHERE id=?').get(i.lastInsertRowid));
  } catch(e) { res.status(409).json({ error: 'Unité déjà existante' }); }
});
app.delete('/api/unites/:id', (req, res) => {
  db.prepare('DELETE FROM unites WHERE id=?').run(req.params.id);
  res.status(204).end();
});

// ══════════════════════════════════════════════════════════════════════════════
// RECETTES — helpers internes
// ══════════════════════════════════════════════════════════════════════════════
function getRecette(id) {
  const r = db.prepare('SELECT * FROM recettes WHERE id=?').get(id);
  if (!r) return null;
  r.tags        = JSON.parse(r.tags || '[]');
  r.favori      = !!r.favori;
  r.ingredients = db.prepare(`
    SELECT ri.*, i.icone as ingredient_icone
    FROM recette_ingredients ri
    LEFT JOIN ingredients i ON LOWER(TRIM(i.nom)) = LOWER(TRIM(ri.nom))
    WHERE ri.recette_id=? ORDER BY ri.position
  `).all(id);
  r.etapes      = db.prepare('SELECT * FROM recette_etapes WHERE recette_id=? ORDER BY position').all(id);
  return r;
}

function expandIngredients(recetteId, portions, basePortions, depth) {
  depth = depth || 0;
  if (depth > 3) return [];
  const ingredients = db.prepare(`
    SELECT ri.*, i.icone as ingredient_icone, r.nom as rayon_nom
    FROM recette_ingredients ri
    LEFT JOIN ingredients i ON LOWER(TRIM(i.nom)) = LOWER(TRIM(ri.nom))
    LEFT JOIN rayons r ON r.id = i.rayon_id
    WHERE ri.recette_id=? ORDER BY ri.position
  `).all(recetteId);
  const result = [];
  const ratio  = basePortions > 0 ? portions / basePortions : 1;
  for (const ing of ingredients) {
    if (ing.type === 'sous_recette' && ing.sous_recette_id) {
      const sub = db.prepare('SELECT * FROM recettes WHERE id=?').get(ing.sous_recette_id);
      if (sub) {
        const subPortions = ing.qty ? parseFloat(ing.qty) * ratio : sub.portions;
        result.push(...expandIngredients(ing.sous_recette_id, subPortions, sub.portions, depth + 1));
        continue;
      }
    }
    const scaledQty = ing.qty && !isNaN(parseFloat(ing.qty))
      ? String(Math.round(parseFloat(ing.qty) * ratio * 100) / 100)
      : ing.qty;
    result.push(Object.assign({}, ing, { qty: scaledQty }));
  }
  return result;
}

function saveIngredients(recetteId, ingredients) {
  db.prepare('DELETE FROM recette_ingredients WHERE recette_id=?').run(recetteId);
  const ins     = db.prepare('INSERT INTO recette_ingredients(recette_id,position,type,nom,qty,unite,sous_recette_id,note) VALUES(?,?,?,?,?,?,?,?)');
  const autoAdd = db.prepare('INSERT OR IGNORE INTO ingredients(nom,categorie,seuil_alerte,icone) VALUES(?,?,?,?)');
  (ingredients || []).forEach((ing, i) => {
    // Auto-ajout transparent dans la table ingredients (sauf sous-recettes)
    if (ing.type !== 'sous_recette' && ing.nom?.trim()) {
      autoAdd.run(ing.nom.trim(), 'Autre', 1, '🥫');
    }
    ins.run(recetteId, i, ing.type||'ingredient', ing.nom||'', ing.qty||'', ing.unite||'', ing.sous_recette_id||null, ing.note||'');
  });
}

function saveEtapes(recetteId, etapes) {
  db.prepare('DELETE FROM recette_etapes WHERE recette_id=?').run(recetteId);
  const ins = db.prepare('INSERT INTO recette_etapes(recette_id,position,titre,texte,timer) VALUES(?,?,?,?,?)');
  (etapes || []).forEach((e, i) => {
    ins.run(recetteId, i, e.titre||'', e.texte||'', e.timer||0);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// RECETTES — routes
// ══════════════════════════════════════════════════════════════════════════════

// IMPORTANT : les routes /import/mealie/* doivent être AVANT /api/recettes/:id
app.get('/api/recettes/import/mealie/search', async (req, res) => {
  const { url: mealie_url, q='', token } = req.query;
  if (!mealie_url) return res.status(400).json({ error: 'url requis' });
  try {
    const base    = mealie_url.replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const search  = q ? `&search=${encodeURIComponent(q)}` : '';
    const PER_PAGE = 50;
    let page = 1, allItems = [], total = 0;
    do {
      const mRes = await fetch(`${base}/api/recipes?page=${page}&perPage=${PER_PAGE}${search}`, { headers });
      if (!mRes.ok) return res.status(mRes.status).json({ error: 'Mealie inaccessible' });
      const data = await mRes.json();
      total = data.total || 0;
      allItems = allItems.concat(data.items || []);
      page++;
    } while (allItems.length < total);
    res.json({
      total,
      items: allItems.map(r => ({
        slug:        r.slug,
        nom:         r.name,
        description: r.description || '',
        photo:       r.image ? `${base}${r.image}` : '',
      }))
    });
  } catch(e) {
    const detail = e.cause?.code || e.cause?.message || e.message;
    res.status(500).json({ error: `Impossible de joindre Mealie (${detail})` });
  }
});

app.post('/api/recettes/import/mealie', async (req, res) => {
  const { mealie_url, recipe_slug, api_token } = req.body;
  if (!mealie_url || !recipe_slug) return res.status(400).json({ error: 'mealie_url et recipe_slug requis' });
  try {
    const base    = mealie_url.replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json' };
    if (api_token) headers['Authorization'] = `Bearer ${api_token}`;
    const mRes    = await fetch(`${base}/api/recipes/${recipe_slug}`, { headers });
    if (!mRes.ok) return res.status(mRes.status).json({ error: `Mealie: ${await mRes.text()}` });
    const m       = await mRes.json();

    const parseDuration = d => {
      if (!d) return 0;
      if (typeof d === 'number') return d;
      const match = String(d).match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
      return match ? (parseInt(match[1]||0)*60)+parseInt(match[2]||0) : 0;
    };

    const tags = [
      ...(m.tags||[]).map(t=>t.name?.toLowerCase()).filter(Boolean),
      ...(m.categories||[]).map(c=>c.name?.toLowerCase()).filter(Boolean),
    ].slice(0, 5);

    const ingredients = (m.recipeIngredient||[]).map((ing, i) => ({
      position: i, type: 'ingredient',
      nom:   ing.food?.name || ing.display || '',
      qty:   ing.quantity != null ? String(ing.quantity) : '',
      unite: ing.unit?.name || '',
      note:  ing.note || '',
      sous_recette_id: null,
    }));

    const etapes = (m.recipeInstructions||[]).map((s, i) => ({
      position: i, titre: s.title||'', texte: s.text||'', timer: 0,
    }));

    const existing = db.prepare('SELECT id FROM recettes WHERE nom=?').get(m.name);
    if (existing) return res.status(409).json({ error: `"${m.name}" existe déjà.`, existing_id: existing.id });

    const ins  = db.prepare('INSERT INTO recettes(nom,emoji,photo,description,portions,temps_prep,temps_cuisson,tags,favori,note,source) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    const info = ins.run(
      m.name||'Recette importée', '🍽️',
      m.image ? `${base}${m.image}` : '',
      m.description||'',
      m.recipeYield ? parseInt(m.recipeYield)||2 : 2,
      parseDuration(m.prepTime),
      parseDuration(m.performTime||m.cookTime),
      JSON.stringify(tags), 0,
      m.rating ? Math.round(parseFloat(m.rating)) : 0,
      m.orgURL || `${base}/g/home/r/${recipe_slug}`
    );
    saveIngredients(info.lastInsertRowid, ingredients);
    saveEtapes(info.lastInsertRowid, etapes);

    // Télécharger la photo depuis Mealie
    const imgPath = m.image || (m.id ? `/api/media/recipes/${m.id}/images/original.webp` : '');
    if (imgPath) {
      try {
        const imgUrl = imgPath.startsWith('http') ? imgPath : `${base}${imgPath}`;
        console.log('[import/mealie] téléchargement photo :', imgUrl);
        const imgRes = await fetch(imgUrl, { headers });
        console.log('[import/mealie] photo status :', imgRes.status);
        if (imgRes.ok) {
          const filename = `r${info.lastInsertRowid}.webp`;
          fs.writeFileSync(path.join(PHOTOS_DIR, filename), Buffer.from(await imgRes.arrayBuffer()));
          db.prepare('UPDATE recettes SET photo=? WHERE id=?').run(`/photos/${filename}`, info.lastInsertRowid);
          console.log('[import/mealie] photo sauvegardée :', filename);
        } else {
          console.error('[import/mealie] photo refusée :', imgRes.status);
        }
      } catch(imgErr) {
        console.error('[import/mealie] photo erreur :', imgErr.message, imgErr.cause?.code || '');
      }
    }

    res.status(201).json({ message: `"${m.name}" importée`, recette: getRecette(info.lastInsertRowid) });
  } catch(e) {
    console.error('[import/mealie]', e);
    const detail = e.cause?.code || e.cause?.message || e.message;
    res.status(500).json({ error: `Erreur import Mealie (${detail})` });
  }
});

app.get('/api/recettes', (_req, res) => {
  const rows = db.prepare(`
    SELECT r.*,
      COUNT(DISTINCT ri.id) AS nb_ingredients,
      COUNT(DISTINCT re.id) AS nb_etapes
    FROM recettes r
    LEFT JOIN recette_ingredients ri ON ri.recette_id=r.id
    LEFT JOIN recette_etapes      re ON re.recette_id=r.id
    GROUP BY r.id ORDER BY r.updated_at DESC
  `).all();
  rows.forEach(r => { r.tags = JSON.parse(r.tags||'[]'); r.favori = !!r.favori; });
  res.json(rows);
});

app.get('/api/ingredients/usedIn', (_req, res) => {
  const rows = db.prepare(
    "SELECT nom, recette_id FROM recette_ingredients WHERE nom IS NOT NULL AND nom != '' AND type != 'sous_recette'"
  ).all();
  const map = {};
  rows.forEach(({ nom, recette_id }) => {
    if (!map[nom]) map[nom] = [];
    if (!map[nom].includes(recette_id)) map[nom].push(recette_id);
  });
  res.json(map);
});

app.get('/api/recettes/:id', (req, res) => {
  const r = getRecette(req.params.id);
  if (!r) return res.status(404).json({ error: 'Recette introuvable' });
  res.json(r);
});

app.post('/api/recettes', (req, res) => {
  const { nom, emoji='🍽️', photo='', description='', portions=2,
          temps_prep=0, temps_cuisson=0, tags=[], favori=false,
          note=0, source='', ingredients=[], etapes=[] } = req.body;
  if (!nom?.trim()) return res.status(400).json({ error: 'nom requis' });
  const ins  = db.prepare('INSERT INTO recettes(nom,emoji,photo,description,portions,temps_prep,temps_cuisson,tags,favori,note,source) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const info = ins.run(nom.trim(), emoji, photo, description, portions, temps_prep, temps_cuisson, JSON.stringify(tags), favori?1:0, note, source);
  saveIngredients(info.lastInsertRowid, ingredients);
  saveEtapes(info.lastInsertRowid, etapes);
  res.status(201).json(getRecette(info.lastInsertRowid));
});

app.patch('/api/recettes/:id', (req, res) => {
  const id = req.params.id;
  if (!db.prepare('SELECT id FROM recettes WHERE id=?').get(id)) return res.status(404).json({ error: 'Introuvable' });
  const sets=[], vals=[];
  ['nom','emoji','photo','description','portions','temps_prep','temps_cuisson','favori','note','source'].forEach(k => {
    if (req.body[k] !== undefined) { sets.push(k+'=?'); vals.push(k==='favori'?(req.body[k]?1:0):req.body[k]); }
  });
  if (req.body.tags !== undefined) { sets.push('tags=?'); vals.push(JSON.stringify(req.body.tags)); }
  sets.push("updated_at=datetime('now')");
  if (sets.length > 1) { vals.push(id); db.prepare(`UPDATE recettes SET ${sets.join(',')} WHERE id=?`).run(...vals); }
  if (req.body.ingredients !== undefined) saveIngredients(id, req.body.ingredients);
  if (req.body.etapes      !== undefined) saveEtapes(id, req.body.etapes);
  res.json(getRecette(id));
});

app.delete('/api/recettes/:id', (req, res) => {
  const used = db.prepare('SELECT COUNT(*) as n FROM recette_ingredients WHERE sous_recette_id=?').get(req.params.id).n;
  if (used > 0) return res.status(409).json({ error: `Utilisée comme sous-recette dans ${used} recette(s).` });
  db.prepare('DELETE FROM recettes WHERE id=?').run(req.params.id);
  res.status(204).end();
});

app.post('/api/recettes/:id/favori', (req, res) => {
  const r = db.prepare('SELECT * FROM recettes WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Introuvable' });
  const newVal = r.favori ? 0 : 1;
  db.prepare("UPDATE recettes SET favori=?,updated_at=datetime('now') WHERE id=?").run(newVal, req.params.id);
  res.json({ favori: !!newVal });
});

app.post('/api/recettes/:id/note', (req, res) => {
  const { note } = req.body;
  if (note === undefined || note < 0 || note > 5) return res.status(400).json({ error: 'note entre 0 et 5' });
  db.prepare("UPDATE recettes SET note=?,updated_at=datetime('now') WHERE id=?").run(note, req.params.id);
  res.json({ note });
});

app.get('/api/recettes/:id/courses', (req, res) => {
  const r = db.prepare('SELECT * FROM recettes WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Introuvable' });
  const portions = parseInt(req.query.portions) || r.portions;
  res.json({ recette_id: r.id, nom: r.nom, photo: r.photo||null, portions, ingredients: expandIngredients(r.id, portions, r.portions) });
});

// ══════════════════════════════════════════════════════════════════════════════
// MENU
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/menu', (_req, res) => {
  const rows = db.prepare("SELECT * FROM menu ORDER BY date, CASE type WHEN 'p' THEN 0 WHEN 'd' THEN 1 WHEN 'g' THEN 2 WHEN 'n' THEN 3 ELSE 4 END, position, id").all();
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.date]) grouped[r.date] = [];
    grouped[r.date].push({ id: r.id, n: r.nom, t: r.type, portions: r.portions, e: r.emoji || '🍽️', note: r.note || '', photo: r.photo || null });
  }
  res.json(grouped);
});

app.post('/api/menu', (req, res) => {
  const { date, n, t = 'n', portions = 2, e = '🍽️', note = '', photo = null } = req.body;
  if (!date || !n) return res.status(400).json({ error: 'date et nom requis' });
  const r = db.prepare('INSERT INTO menu (date,nom,type,portions,emoji,note,photo) VALUES (?,?,?,?,?,?,?)').run(date, n, t, portions, e || '🍽️', note || '', photo);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/menu/:id', (req, res) => {
  const { date, n, t, portions, e, note, photo, position } = req.body;
  const fields = [], vals = [];
  if (date     !== undefined) { fields.push('date=?');     vals.push(date); }
  if (n        !== undefined) { fields.push('nom=?');      vals.push(n); }
  if (t        !== undefined) { fields.push('type=?');     vals.push(t); }
  if (portions !== undefined) { fields.push('portions=?'); vals.push(portions); }
  if (e        !== undefined) { fields.push('emoji=?');    vals.push(e); }
  if (note     !== undefined) { fields.push('note=?');     vals.push(note); }
  if (photo    !== undefined) { fields.push('photo=?');    vals.push(photo); }
  if (position !== undefined) { fields.push('position=?'); vals.push(position); }
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id);
  db.prepare(`UPDATE menu SET ${fields.join(',')} WHERE id=?`).run(...vals);
  res.json({ ok: true });
});

app.delete('/api/menu/:id', (req, res) => {
  db.prepare('DELETE FROM menu WHERE id=?').run(req.params.id);
  res.status(204).end();
});

// ══════════════════════════════════════════════════════════════════════════════
// COURSES
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/courses', (_req, res) => {
  const items = db.prepare(`
    SELECT ci.*, COALESCE(i.nom, ci.nom) AS resolved_nom,
           COALESCE(i.icone, ci.icone) AS resolved_icone,
           COALESCE(rv.nom, ci.rayon) AS resolved_rayon
    FROM courses_items ci
    LEFT JOIN ingredients i ON i.id = ci.ingredient_id
    LEFT JOIN rayons rv ON rv.id = i.rayon_id
    ORDER BY ci.id DESC
  `).all().map(r => ({
    id: r.id, n: r.resolved_nom, icone: r.resolved_icone||null, m: r.marchand, r: r.resolved_rayon||'Autre',
    qty: r.qty, unit: r.unite||'', done: !!r.done, origin: r.origin||'manuel',
    recipeId: r.recipe_id||null, ingredientId: r.ingredient_id||null
  }));
  const recipes = db.prepare('SELECT * FROM courses_recipes').all().map(r => ({
    id: r.recipe_id, nom: r.nom, photo: r.photo||null, portions: r.portions
  }));
  res.json({ items, recipes });
});

app.post('/api/courses/items', (req, res) => {
  const { n, icone=null, m='drive', r='Autre', qty=1, unit='', done=false, origin='manuel', recipeId=null } = req.body;
  if (!n) return res.status(400).json({ error: 'nom requis' });
  const result = db.prepare('INSERT INTO courses_items (nom,icone,marchand,rayon,qty,unite,done,origin,recipe_id) VALUES (?,?,?,?,?,?,?,?,?)').run(n, icone, m, r, qty, unit, done?1:0, origin, recipeId);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/courses/items/:id', (req, res) => {
  const { n, icone, m, r, qty, unit, done, origin, recipeId, ingredientId } = req.body;
  const fields = [], vals = [];
  if (n            !== undefined) { fields.push('nom=?');          vals.push(n); }
  if (icone        !== undefined) { fields.push('icone=?');        vals.push(icone); }
  if (m            !== undefined) { fields.push('marchand=?');     vals.push(m); }
  if (r            !== undefined) { fields.push('rayon=?');        vals.push(r); }
  if (qty          !== undefined) { fields.push('qty=?');          vals.push(qty); }
  if (unit         !== undefined) { fields.push('unite=?');        vals.push(unit); }
  if (done         !== undefined) { fields.push('done=?');         vals.push(done?1:0); }
  if (origin       !== undefined) { fields.push('origin=?');       vals.push(origin); }
  if (recipeId     !== undefined) { fields.push('recipe_id=?');    vals.push(recipeId); }
  if (ingredientId !== undefined) { fields.push('ingredient_id=?');vals.push(ingredientId); }
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id);
  db.prepare(`UPDATE courses_items SET ${fields.join(',')} WHERE id=?`).run(...vals);
  res.json({ ok: true });
});

app.delete('/api/courses/items/:id', (req, res) => {
  db.prepare('DELETE FROM courses_items WHERE id=?').run(req.params.id);
  res.status(204).end();
});

app.post('/api/courses/recipes', (req, res) => {
  const { id, nom, photo=null, portions=2 } = req.body;
  if (!id || !nom) return res.status(400).json({ error: 'id et nom requis' });
  db.prepare('INSERT OR REPLACE INTO courses_recipes (recipe_id,nom,photo,portions) VALUES (?,?,?,?)').run(id, nom, photo, portions);
  res.json({ ok: true });
});

app.put('/api/courses/recipes/:id', (req, res) => {
  const { portions, qty_ratio } = req.body;
  db.transaction(() => {
    if (qty_ratio)             db.prepare('UPDATE courses_items SET qty=ROUND(qty*?,1) WHERE recipe_id=?').run(qty_ratio, req.params.id);
    if (portions !== undefined) db.prepare('UPDATE courses_recipes SET portions=? WHERE recipe_id=?').run(portions, req.params.id);
  })();
  res.json({ ok: true });
});

app.delete('/api/courses/recipes/:id', (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM courses_items WHERE recipe_id=?').run(req.params.id);
    db.prepare('DELETE FROM courses_recipes WHERE recipe_id=?').run(req.params.id);
  })();
  res.status(204).end();
});

// ══════════════════════════════════════════════════════════════════════════════
// RAYONS (référentiel global)
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/rayons', (_req, res) => {
  res.json(db.prepare('SELECT * FROM rayons ORDER BY id').all());
});

app.post('/api/rayons', (req, res) => {
  const { nom, emoji='📦' } = req.body;
  if (!nom?.trim()) return res.status(400).json({ error: 'nom requis' });
  try {
    const r = db.prepare('INSERT INTO rayons(nom,emoji) VALUES(?,?)').run(nom.trim(), emoji);
    res.status(201).json(db.prepare('SELECT * FROM rayons WHERE id=?').get(r.lastInsertRowid));
  } catch(e) {
    res.status(e.message.includes('UNIQUE') ? 409 : 500).json({ error: e.message.includes('UNIQUE') ? 'Rayon déjà existant' : e.message });
  }
});

app.patch('/api/rayons/:id', (req, res) => {
  const f=[], v=[];
  ['nom','emoji'].forEach(k => { if (req.body[k] !== undefined) { f.push(k+'=?'); v.push(req.body[k]); } });
  if (!f.length) return res.status(400).json({ error: 'Rien à modifier' });
  v.push(req.params.id);
  try {
    db.prepare(`UPDATE rayons SET ${f.join(',')} WHERE id=?`).run(...v);
    res.json(db.prepare('SELECT * FROM rayons WHERE id=?').get(req.params.id));
  } catch(e) {
    res.status(409).json({ error: 'Nom déjà utilisé' });
  }
});

app.delete('/api/rayons/:id', (req, res) => {
  const n_ing = db.prepare('SELECT COUNT(*) as n FROM ingredients WHERE rayon_id=?').get(req.params.id).n;
  const n_mr  = db.prepare('SELECT COUNT(*) as n FROM marchand_rayons WHERE rayon_id=?').get(req.params.id).n;
  if (n_ing > 0 || n_mr > 0)
    return res.status(409).json({ error: `Rayon utilisé par ${n_ing} ingrédient(s) et ${n_mr} marchand(s)` });
  db.prepare('DELETE FROM rayons WHERE id=?').run(req.params.id);
  res.status(204).end();
});

// ══════════════════════════════════════════════════════════════════════════════
// MARCHANDS
// ══════════════════════════════════════════════════════════════════════════════

const _sqlMarchandRayons = `
  SELECT r.id, r.nom, r.emoji, mr.position
  FROM marchand_rayons mr JOIN rayons r ON r.id=mr.rayon_id
  WHERE mr.marchand_id=? ORDER BY mr.position, mr.id`;

function getMarchand(id) {
  const m = db.prepare('SELECT * FROM marchands WHERE id=?').get(id);
  if (!m) return null;
  m.rayons = db.prepare(_sqlMarchandRayons).all(id);
  return m;
}

app.get('/api/marchands', (_req, res) => {
  const marchands = db.prepare('SELECT * FROM marchands ORDER BY position, id').all();
  marchands.forEach(m => { m.rayons = db.prepare(_sqlMarchandRayons).all(m.id); });
  res.json(marchands);
});

app.post('/api/marchands', (req, res) => {
  const { nom, emoji='🏪', image=null } = req.body;
  if (!nom?.trim()) return res.status(400).json({ error: 'nom requis' });
  const pos = db.prepare('SELECT COALESCE(MAX(position)+1,0) AS p FROM marchands').get().p;
  const r = db.prepare('INSERT INTO marchands(nom,emoji,image,position) VALUES(?,?,?,?)').run(nom.trim(), emoji, image, pos);
  res.status(201).json(getMarchand(r.lastInsertRowid));
});

app.patch('/api/marchands/:id', (req, res) => {
  const f=[], v=[];
  ['nom','emoji','image','search_url'].forEach(k => { if (req.body[k] !== undefined) { f.push(k+'=?'); v.push(req.body[k]); } });
  if (!f.length) return res.status(400).json({ error: 'Rien à modifier' });
  v.push(req.params.id);
  db.prepare(`UPDATE marchands SET ${f.join(',')} WHERE id=?`).run(...v);
  res.json(getMarchand(req.params.id));
});

app.delete('/api/marchands/:id', (req, res) => {
  db.prepare('DELETE FROM marchands WHERE id=?').run(req.params.id);
  res.status(204).end();
});

// POST /api/marchands/:id/rayons  — lie un rayon global au marchand (crée le rayon s'il n'existe pas)
app.post('/api/marchands/:id/rayons', (req, res) => {
  const { rayon_id, nom, emoji='📦' } = req.body;
  let rId = rayon_id ? parseInt(rayon_id) : null;
  if (!rId && nom?.trim()) {
    const existing = db.prepare('SELECT id FROM rayons WHERE LOWER(TRIM(nom))=LOWER(TRIM(?))').get(nom.trim());
    if (existing) { rId = existing.id; }
    else {
      try {
        const r = db.prepare('INSERT INTO rayons(nom,emoji) VALUES(?,?)').run(nom.trim(), emoji);
        rId = r.lastInsertRowid;
      } catch(e) { return res.status(500).json({ error: e.message }); }
    }
  }
  if (!rId) return res.status(400).json({ error: 'rayon_id ou nom requis' });
  const pos = db.prepare('SELECT COALESCE(MAX(position)+1,0) AS p FROM marchand_rayons WHERE marchand_id=?').get(req.params.id).p;
  try {
    db.prepare('INSERT INTO marchand_rayons(marchand_id,rayon_id,position) VALUES(?,?,?)').run(req.params.id, rId, pos);
    res.status(201).json(db.prepare('SELECT r.id,r.nom,r.emoji,mr.position FROM marchand_rayons mr JOIN rayons r ON r.id=mr.rayon_id WHERE mr.marchand_id=? AND mr.rayon_id=?').get(req.params.id, rId));
  } catch(e) {
    res.status(409).json({ error: 'Rayon déjà présent chez ce marchand' });
  }
});

// DELETE /api/marchands/:id/rayons/:rayon_id — supprime le lien (le rayon global reste)
app.delete('/api/marchands/:id/rayons/:rid', (req, res) => {
  db.prepare('DELETE FROM marchand_rayons WHERE marchand_id=? AND rayon_id=?').run(req.params.id, req.params.rid);
  res.status(204).end();
});

// PUT /api/marchands/:id/rayons/order — réordonne les rayons d'un marchand
app.put('/api/marchands/:id/rayons/order', (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order requis' });
  const upd = db.prepare('UPDATE marchand_rayons SET position=? WHERE marchand_id=? AND rayon_id=?');
  db.transaction(() => { order.forEach(({ rayon_id, position }) => upd.run(position, req.params.id, rayon_id)); })();
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// TAGS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/tags', (_req, res) => {
  res.json(db.prepare('SELECT * FROM tags ORDER BY nom').all());
});

app.post('/api/tags', (req, res) => {
  const nom = (req.body.nom || '').trim().toLowerCase();
  if (!nom) return res.status(400).json({ error: 'nom requis' });
  try {
    const r = db.prepare('INSERT INTO tags(nom) VALUES(?)').run(nom);
    res.status(201).json(db.prepare('SELECT * FROM tags WHERE id=?').get(r.lastInsertRowid));
  } catch(e) {
    const existing = db.prepare('SELECT * FROM tags WHERE nom=?').get(nom);
    if (existing) return res.json(existing);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/tags/:id', (req, res) => {
  const tag = db.prepare('SELECT * FROM tags WHERE id=?').get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Tag introuvable' });
  db.transaction(() => {
    db.prepare("SELECT id, tags FROM recettes WHERE tags LIKE ?").all('%' + tag.nom + '%')
      .forEach(r => {
        try {
          const arr = JSON.parse(r.tags || '[]');
          const filtered = arr.filter(t => t !== tag.nom);
          if (filtered.length !== arr.length)
            db.prepare('UPDATE recettes SET tags=? WHERE id=?').run(JSON.stringify(filtered), r.id);
        } catch(_) {}
      });
    db.prepare('DELETE FROM tags WHERE id=?').run(req.params.id);
  })();
  res.status(204).end();
});

// ══════════════════════════════════════════════════════════════════════════════
// SUGGESTION RULES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/suggestion-rules', (_req, res) => {
  const rows = db.prepare('SELECT * FROM suggestion_rules ORDER BY position, id').all();
  rows.forEach(r => {
    r.days       = JSON.parse(r.days       || '[]');
    r.meals      = JSON.parse(r.meals      || '[]');
    r.conditions = JSON.parse(r.conditions || '[]');
    r.active     = !!r.active;
  });
  res.json(rows);
});

app.put('/api/suggestion-rules', (req, res) => {
  const rules = req.body;
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'Array expected' });
  db.transaction(() => {
    db.prepare('DELETE FROM suggestion_rules').run();
    const ins = db.prepare('INSERT INTO suggestion_rules(id,name,active,days,meals,conditions,position) VALUES(?,?,?,?,?,?,?)');
    rules.forEach((r, i) => {
      ins.run(r.id || null, r.name || 'Règle', r.active ? 1 : 0,
        JSON.stringify(r.days  || []),
        JSON.stringify(r.meals || []),
        JSON.stringify(r.conditions || []), i);
    });
  })();
  res.json({ ok: true });
});

// GET /api/suggestion?day=0-6&meal=p|d|n|g|a
// day : 0=Lun … 6=Dim  (JS: (getDay()+6)%7)
app.get('/api/suggestion', (req, res) => {
  const dayParam  = parseInt(req.query.day);
  const mealParam = req.query.meal || '';

  // Saison courante
  const month  = new Date().getMonth() + 1;
  const season = month >= 3 && month <= 5 ? 'printemps'
               : month >= 6 && month <= 8 ? 'été'
               : month >= 9 && month <= 11 ? 'automne' : 'hiver';

  // Règles actives applicables au jour + repas
  const rules = db.prepare('SELECT * FROM suggestion_rules WHERE active=1').all().map(r => ({
    days:       JSON.parse(r.days       || '[]'),
    meals:      JSON.parse(r.meals      || '[]'),
    conditions: JSON.parse(r.conditions || '[]'),
  }));

  const conds = [];
  for (const rule of rules) {
    if (rule.days.includes(dayParam) && rule.meals.includes(mealParam)) {
      conds.push(...rule.conditions);
    }
  }

  // Agréger les conditions
  const tagNeqs = [], tagEqs = [];
  let requireSeasonal = false, notRecentDays = null;
  for (const c of conds) {
    if (c.type === 'tag_neq')    tagNeqs.push(c.val);
    else if (c.type === 'tag_eq')     tagEqs.push(c.val);
    else if (c.type === 'seasonal')   requireSeasonal = true;
    else if (c.type === 'not_recent') {
      const d = parseInt(c.val) || 7;
      notRecentDays = notRecentDays === null ? d : Math.max(notRecentDays, d);
    }
  }

  let recipes = db.prepare('SELECT * FROM recettes').all();
  recipes.forEach(r => { r.tags = JSON.parse(r.tags || '[]'); });

  // tag_neq
  if (tagNeqs.length) recipes = recipes.filter(r => !tagNeqs.some(t => r.tags.includes(t)));
  // tag_eq
  if (tagEqs.length)  recipes = recipes.filter(r => tagEqs.every(t => r.tags.includes(t)));

  // not_recent : exclure les recettes servies dans les X derniers jours
  if (notRecentDays !== null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - notRecentDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const recentNames = new Set(
      db.prepare('SELECT DISTINCT nom FROM menu WHERE date >= ?').all(cutoffStr).map(r => r.nom.toLowerCase())
    );
    recipes = recipes.filter(r => !recentNames.has(r.nom.toLowerCase()));
  }

  // seasonal : tous les ingrédients liés doivent être de saison
  if (requireSeasonal) {
    recipes = recipes.filter(r => {
      const ings = db.prepare(`
        SELECT i.saison FROM recette_ingredients ri
        JOIN ingredients i ON LOWER(TRIM(i.nom)) = LOWER(TRIM(ri.nom))
        WHERE ri.recette_id = ?
      `).all(r.id);
      if (!ings.length) return true;
      return ings.every(ing => {
        const saisons = JSON.parse(ing.saison || '[]');
        return !saisons.length || saisons.includes(season);
      });
    });
  }

  if (!recipes.length) return res.json(null);
  res.json(recipes[Math.floor(Math.random() * recipes.length)]);
});

// ══════════════════════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => console.log(`[KitchenCore] v0.9 démarré sur http://0.0.0.0:${PORT}`));
