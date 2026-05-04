/**
 * KitchenCore v0.1 – Version test pour Home Assistant
 * Serveur minimal avec SQLite intégré
 */
'use strict';

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app  = express();
const PORT = 8099;

// ── Base de données ───────────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_PATH || '/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'kitchencore.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS aliments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nom          TEXT    NOT NULL UNIQUE,
    categorie    TEXT    DEFAULT 'Autre',
    seuil_alerte REAL    DEFAULT 1,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS produits (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    aliment_id   INTEGER NOT NULL REFERENCES aliments(id),
    nom          TEXT    NOT NULL,
    code_barres  TEXT    UNIQUE,
    contenance   REAL    DEFAULT 1,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stocks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    produit_id    INTEGER NOT NULL UNIQUE REFERENCES produits(id),
    packs_pleins  INTEGER DEFAULT 0,
    unites_ouvert INTEGER DEFAULT 0,
    updated_at    TEXT    DEFAULT (datetime('now'))
  );
`);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ── Interface Web minimale ────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  const aliments = db.prepare(`
    SELECT a.*, COUNT(p.id) AS nb_produits,
           COALESCE(SUM((s.packs_pleins * p.contenance) + s.unites_ouvert),0) AS stock_total
    FROM aliments a
    LEFT JOIN produits p ON p.aliment_id = a.id
    LEFT JOIN stocks   s ON s.produit_id = p.id
    GROUP BY a.id ORDER BY a.nom
  `).all();

  const rows = aliments.map(a => `
    <tr style="background:${a.stock_total < a.seuil_alerte ? '#fff3cd' : 'white'}">
      <td>${a.nom}</td>
      <td>${a.categorie}</td>
      <td>${a.stock_total} / ${a.seuil_alerte}</td>
      <td>${a.nb_produits}</td>
      <td>${a.stock_total < a.seuil_alerte ? '⚠️ Alerte' : '✅ OK'}</td>
    </tr>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>KitchenCore</title>
  <style>
    body { font-family: sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
    h1   { color: #2d6a4f; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { padding: .6rem 1rem; border: 1px solid #ddd; text-align: left; }
    th { background: #2d6a4f; color: white; }
    .badge { background: #e9f5ee; color: #2d6a4f; padding: .2rem .6rem; border-radius: 99px; font-size: .85rem; }
  </style>
</head>
<body>
  <h1>🥦 KitchenCore <span class="badge">v0.1 – Test</span></h1>
  <p>API disponible sur le port <strong>8099</strong>. Utilisez un client REST (ex: Postman, curl) pour interagir.</p>
  <h2>Aliments enregistrés (${aliments.length})</h2>
  ${aliments.length === 0
    ? '<p><em>Aucun aliment. Utilisez POST /api/aliments pour en créer un.</em></p>'
    : `<table><thead><tr><th>Nom</th><th>Catégorie</th><th>Stock / Seuil</th><th>Produits</th><th>État</th></tr></thead><tbody>${rows}</tbody></table>`
  }
  <hr>
  <h3>Routes disponibles</h3>
  <ul>
    <li><code>GET  /api/aliments</code> – liste des aliments</li>
    <li><code>POST /api/aliments</code> – créer un aliment</li>
    <li><code>GET  /api/produits</code> – liste des produits</li>
    <li><code>POST /api/produits</code> – créer un produit</li>
    <li><code>POST /api/stocks/:produit_id/consommer</code> – décrémenter</li>
    <li><code>POST /api/iot/scan</code> – scan code-barres (ESP32)</li>
    <li><code>GET  /health</code> – statut du service</li>
  </ul>
</body>
</html>`);
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '0.1.0' }));

// ── Aliments ──────────────────────────────────────────────────────────────────
app.get('/api/aliments', (_req, res) => {
  const rows = db.prepare(`
    SELECT a.*, COALESCE(SUM((s.packs_pleins * p.contenance) + s.unites_ouvert),0) AS stock_total
    FROM aliments a
    LEFT JOIN produits p ON p.aliment_id = a.id
    LEFT JOIN stocks   s ON s.produit_id = p.id
    GROUP BY a.id ORDER BY a.nom
  `).all();
  res.json(rows);
});

app.post('/api/aliments', (req, res) => {
  const { nom, categorie = 'Autre', seuil_alerte = 1 } = req.body;
  if (!nom) return res.status(400).json({ error: '"nom" est requis.' });
  try {
    const info = db.prepare(
      'INSERT INTO aliments (nom, categorie, seuil_alerte) VALUES (?, ?, ?)'
    ).run(nom.trim(), categorie, seuil_alerte);
    res.status(201).json(db.prepare('SELECT * FROM aliments WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Aliment déjà existant.' });
    res.status(500).json({ error: e.message });
  }
});

// ── Produits ──────────────────────────────────────────────────────────────────
app.get('/api/produits', (_req, res) => {
  res.json(db.prepare(`
    SELECT p.*, a.nom AS aliment_nom, s.packs_pleins, s.unites_ouvert
    FROM produits p
    JOIN aliments a ON a.id = p.aliment_id
    LEFT JOIN stocks s ON s.produit_id = p.id
    ORDER BY a.nom, p.nom
  `).all());
});

app.post('/api/produits', (req, res) => {
  const { aliment_id, nom, code_barres, contenance = 1 } = req.body;
  if (!aliment_id || !nom) return res.status(400).json({ error: '"aliment_id" et "nom" sont requis.' });
  try {
    const info = db.prepare(
      'INSERT INTO produits (aliment_id, nom, code_barres, contenance) VALUES (?, ?, ?, ?)'
    ).run(aliment_id, nom.trim(), code_barres || null, contenance);
    // Créer stock vide
    db.prepare('INSERT INTO stocks (produit_id) VALUES (?)').run(info.lastInsertRowid);
    res.status(201).json(db.prepare('SELECT * FROM produits WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Code-barres déjà utilisé.' });
    res.status(500).json({ error: e.message });
  }
});

// ── Stocks ────────────────────────────────────────────────────────────────────
app.get('/api/stocks', (_req, res) => {
  res.json(db.prepare(`
    SELECT s.*, p.nom AS produit_nom, p.contenance, a.nom AS aliment_nom, a.seuil_alerte,
           ((s.packs_pleins * p.contenance) + s.unites_ouvert) AS total_unites
    FROM stocks s
    JOIN produits p ON p.id = s.produit_id
    JOIN aliments a ON a.id = p.aliment_id
  `).all());
});

app.post('/api/stocks/:produit_id/ajouter', (req, res) => {
  const { packs = 0, unites = 0 } = req.body;
  const { produit_id } = req.params;
  db.prepare('UPDATE stocks SET packs_pleins = packs_pleins + ?, unites_ouvert = unites_ouvert + ?, updated_at = datetime("now") WHERE produit_id = ?')
    .run(packs, unites, produit_id);
  res.json(db.prepare('SELECT * FROM stocks WHERE produit_id = ?').get(produit_id));
});

app.post('/api/stocks/:produit_id/consommer', (req, res) => {
  const { produit_id } = req.params;
  const produit = db.prepare('SELECT p.contenance, s.packs_pleins, s.unites_ouvert FROM produits p JOIN stocks s ON s.produit_id = p.id WHERE p.id = ?').get(produit_id);
  if (!produit) return res.status(404).json({ error: 'Produit introuvable.' });

  let { packs_pleins, unites_ouvert } = produit;
  const { contenance } = produit;
  let pack_deballe = false;

  unites_ouvert -= 1;
  if (unites_ouvert < 0) {
    if (packs_pleins <= 0) return res.status(422).json({ error: 'Stock vide !' });
    packs_pleins  -= 1;
    unites_ouvert += contenance;
    pack_deballe   = true;
  }

  db.prepare('UPDATE stocks SET packs_pleins = ?, unites_ouvert = ?, updated_at = datetime("now") WHERE produit_id = ?')
    .run(packs_pleins, unites_ouvert, produit_id);

  res.json({
    stock: db.prepare('SELECT * FROM stocks WHERE produit_id = ?').get(produit_id),
    pack_deballe,
  });
});

// ── IoT Bridge ────────────────────────────────────────────────────────────────
app.post('/api/iot/scan', (req, res) => {
  const { code_barres } = req.body;
  if (!code_barres) return res.status(400).json({ error: '"code_barres" est requis.' });

  const produit = db.prepare('SELECT p.*, s.packs_pleins, s.unites_ouvert FROM produits p LEFT JOIN stocks s ON s.produit_id = p.id WHERE p.code_barres = ?').get(code_barres);
  if (!produit) return res.status(404).json({ error: 'Code-barres inconnu.', code_barres });

  let { packs_pleins, unites_ouvert, contenance } = produit;
  let pack_deballe = false;

  unites_ouvert -= 1;
  if (unites_ouvert < 0) {
    if (packs_pleins <= 0) return res.status(422).json({ error: 'Stock vide !', produit_nom: produit.nom });
    packs_pleins  -= 1;
    unites_ouvert += contenance;
    pack_deballe   = true;
  }

  db.prepare('UPDATE stocks SET packs_pleins = ?, unites_ouvert = ?, updated_at = datetime("now") WHERE produit_id = ?')
    .run(packs_pleins, unites_ouvert, produit.id);

  res.json({ ok: true, produit_nom: produit.nom, packs_pleins, unites_ouvert, pack_deballe });
});

// ── Démarrage ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[KitchenCore] ✅ Démarré sur http://0.0.0.0:${PORT}`);
});
