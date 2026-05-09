/**
 * KitchenCore v0.4 – Interface mobile avancée
 */
'use strict';

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app  = express();
const PORT = 8099;

const DATA_DIR = process.env.DATA_PATH || '/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'kitchencore.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS aliments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nom          TEXT NOT NULL UNIQUE,
    categorie    TEXT DEFAULT 'Autre',
    seuil_alerte REAL DEFAULT 1,
    icone        TEXT DEFAULT '🥫',
    created_at   TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS produits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    aliment_id  INTEGER NOT NULL REFERENCES aliments(id),
    nom         TEXT NOT NULL,
    marque      TEXT,
    code_barres TEXT UNIQUE,
    contenance  REAL DEFAULT 1,
    unite       TEXT DEFAULT 'unité',
    created_at  TEXT DEFAULT (datetime('now'))
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
`);

app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// UI
const HTML = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
app.get('/', (_req, res) => res.send(HTML));
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '0.4.0' }));

// ALIMENTS
app.get('/api/aliments', (_req, res) => {
  res.json(db.prepare(`
    SELECT a.*, COUNT(DISTINCT p.id) AS nb_produits,
      COALESCE(SUM((s.packs_pleins*p.contenance)+s.unites_ouvert),0) AS stock_total
    FROM aliments a
    LEFT JOIN produits p ON p.aliment_id=a.id
    LEFT JOIN stocks   s ON s.produit_id=p.id
    GROUP BY a.id ORDER BY a.categorie,a.nom
  `).all());
});
app.post('/api/aliments', (req,res) => {
  const {nom,categorie='Autre',seuil_alerte=1,icone='🥫'} = req.body;
  if (!nom) return res.status(400).json({error:'nom requis'});
  try {
    const i = db.prepare('INSERT INTO aliments(nom,categorie,seuil_alerte,icone) VALUES(?,?,?,?)').run(nom.trim(),categorie,seuil_alerte,icone);
    res.status(201).json(db.prepare('SELECT * FROM aliments WHERE id=?').get(i.lastInsertRowid));
  } catch(e) { res.status(e.message.includes('UNIQUE')?409:500).json({error:e.message.includes('UNIQUE')?'Aliment déjà existant.':e.message}); }
});
app.patch('/api/aliments/:id', (req,res) => {
  const f=[],v=[];
  ['nom','categorie','seuil_alerte','icone'].forEach(k=>{ if(req.body[k]!==undefined){f.push(k+'=?');v.push(req.body[k])} });
  if(!f.length) return res.status(400).json({error:'Rien à modifier'});
  v.push(req.params.id);
  db.prepare(`UPDATE aliments SET ${f.join(',')} WHERE id=?`).run(...v);
  res.json(db.prepare('SELECT * FROM aliments WHERE id=?').get(req.params.id));
});
app.delete('/api/aliments/:id', (req,res) => {
  const n = db.prepare('SELECT COUNT(*) as n FROM produits WHERE aliment_id=?').get(req.params.id).n;
  if(n>0) return res.status(409).json({error:`${n} produit(s) lié(s)`});
  db.prepare('DELETE FROM aliments WHERE id=?').run(req.params.id);
  res.status(204).end();
});

// PRODUITS
app.get('/api/produits', (_req,res) => {
  res.json(db.prepare(`
    SELECT p.*, a.nom AS aliment_nom, a.icone, a.seuil_alerte,
           s.packs_pleins, s.unites_ouvert, s.zone,
           ((COALESCE(s.packs_pleins,0)*p.contenance)+COALESCE(s.unites_ouvert,0)) AS total_unites
    FROM produits p JOIN aliments a ON a.id=p.aliment_id
    LEFT JOIN stocks s ON s.produit_id=p.id
    ORDER BY s.zone,a.nom,p.nom
  `).all());
});
app.get('/api/produits/barcode/:code', (req,res) => {
  const row = db.prepare(`
    SELECT p.*, a.nom AS aliment_nom, a.icone, a.seuil_alerte, s.packs_pleins, s.unites_ouvert, s.zone
    FROM produits p JOIN aliments a ON a.id=p.aliment_id LEFT JOIN stocks s ON s.produit_id=p.id
    WHERE p.code_barres=?
  `).get(req.params.code);
  if(!row) return res.status(404).json({error:'Code-barres inconnu',code:req.params.code});
  res.json(row);
});
app.post('/api/produits', (req,res) => {
  const {aliment_id,nom,marque,code_barres,contenance=1,unite='unité',zone='Frigo'} = req.body;
  if(!aliment_id||!nom) return res.status(400).json({error:'aliment_id et nom requis'});
  try {
    const i = db.prepare('INSERT INTO produits(aliment_id,nom,marque,code_barres,contenance,unite) VALUES(?,?,?,?,?,?)').run(aliment_id,nom.trim(),marque||null,code_barres||null,contenance,unite);
    db.prepare('INSERT INTO stocks(produit_id,zone) VALUES(?,?)').run(i.lastInsertRowid,zone);
    res.status(201).json(db.prepare('SELECT * FROM produits WHERE id=?').get(i.lastInsertRowid));
  } catch(e) { res.status(e.message.includes('UNIQUE')?409:500).json({error:e.message.includes('UNIQUE')?'Code-barres déjà utilisé':e.message}); }
});
app.patch('/api/produits/:id', (req,res) => {
  const f=[],v=[];
  ['nom','marque','code_barres','contenance','unite'].forEach(k=>{ if(req.body[k]!==undefined){f.push(k+'=?');v.push(req.body[k])} });
  if(!f.length) return res.status(400).json({error:'Rien à modifier'});
  v.push(req.params.id);
  try { db.prepare(`UPDATE produits SET ${f.join(',')} WHERE id=?`).run(...v); res.json(db.prepare('SELECT * FROM produits WHERE id=?').get(req.params.id)); }
  catch(e) { res.status(409).json({error:'Code-barres déjà utilisé'}); }
});

// STOCKS
app.get('/api/stocks', (_req,res) => {
  res.json(db.prepare(`
    SELECT s.*, p.nom AS produit_nom, p.contenance, p.unite, p.code_barres,
           a.nom AS aliment_nom, a.icone, a.seuil_alerte, a.categorie,
           ((s.packs_pleins*p.contenance)+s.unites_ouvert) AS total_unites
    FROM stocks s JOIN produits p ON p.id=s.produit_id JOIN aliments a ON a.id=p.aliment_id
    ORDER BY s.zone,a.nom
  `).all());
});
app.post('/api/stocks/:id/ajouter', (req,res) => {
  const {packs=0,unites=0,zone} = req.body; const {id}=req.params;
  const s=['packs_pleins=MAX(0,packs_pleins+?)','unites_ouvert=MAX(0,unites_ouvert+?)','updated_at=datetime(\'now\')'],v=[+packs,+unites];
  if(zone){s.push('zone=?');v.push(zone);} v.push(id);
  db.prepare(`UPDATE stocks SET ${s.join(',')} WHERE produit_id=?`).run(...v);
  const d=+packs+(+unites); if(d!==0) db.prepare('INSERT INTO mouvements(produit_id,type,delta,source) VALUES(?,\'ajout\',?,\'web\')').run(id,d);
  res.json(db.prepare('SELECT * FROM stocks WHERE produit_id=?').get(id));
});
app.post('/api/stocks/:id/consommer', (req,res) => {
  const {id}=req.params; const src=req.body.source||'web';
  const p=db.prepare('SELECT p.contenance,s.packs_pleins,s.unites_ouvert FROM produits p JOIN stocks s ON s.produit_id=p.id WHERE p.id=?').get(id);
  if(!p) return res.status(404).json({error:'Introuvable'});
  let {packs_pleins,unites_ouvert,contenance}=p; let pd=false;
  unites_ouvert-=1;
  if(unites_ouvert<0){ if(packs_pleins<=0) return res.status(422).json({error:'Stock vide'}); packs_pleins--;unites_ouvert+=contenance;pd=true; }
  db.prepare('UPDATE stocks SET packs_pleins=?,unites_ouvert=?,updated_at=datetime(\'now\') WHERE produit_id=?').run(packs_pleins,unites_ouvert,id);
  db.prepare('INSERT INTO mouvements(produit_id,type,delta,source) VALUES(?,\'consommation\',-1,?)').run(id,src);
  res.json({stock:db.prepare('SELECT * FROM stocks WHERE produit_id=?').get(id),pack_deballe:pd});
});
app.post('/api/stocks/:id/corriger', (req,res) => {
  const {packs_pleins=0,unites_ouvert=0,zone}=req.body; const {id}=req.params;
  const s=['packs_pleins=?','unites_ouvert=?','updated_at=datetime(\'now\')'],v=[+packs_pleins,+unites_ouvert];
  if(zone){s.push('zone=?');v.push(zone);} v.push(id);
  db.prepare(`UPDATE stocks SET ${s.join(',')} WHERE produit_id=?`).run(...v);
  db.prepare('INSERT INTO mouvements(produit_id,type,delta,source) VALUES(?,\'correction\',0,\'web\')').run(id);
  res.json(db.prepare('SELECT * FROM stocks WHERE produit_id=?').get(id));
});

// IOT
app.post('/api/iot/scan', (req,res) => {
  const {code_barres}=req.body;
  if(!code_barres) return res.status(400).json({error:'code_barres requis'});
  const p=db.prepare('SELECT p.*,s.packs_pleins,s.unites_ouvert,s.zone FROM produits p LEFT JOIN stocks s ON s.produit_id=p.id WHERE p.code_barres=?').get(code_barres);
  if(!p) return res.status(404).json({error:'Code-barres inconnu',code_barres});
  let {packs_pleins,unites_ouvert,contenance}=p; let pd=false;
  unites_ouvert-=1;
  if(unites_ouvert<0){ if(packs_pleins<=0) return res.status(422).json({error:'Stock vide',produit_nom:p.nom}); packs_pleins--;unites_ouvert+=contenance;pd=true; }
  db.prepare('UPDATE stocks SET packs_pleins=?,unites_ouvert=?,updated_at=datetime(\'now\') WHERE produit_id=?').run(packs_pleins,unites_ouvert,p.id);
  db.prepare('INSERT INTO mouvements(produit_id,type,delta,source) VALUES(?,\'consommation\',-1,\'iot\')').run(p.id);
  res.json({ok:true,produit_nom:p.nom,packs_pleins,unites_ouvert,pack_deballe:pd,zone:p.zone});
});

// MOUVEMENTS
app.get('/api/mouvements', (_req,res) => {
  res.json(db.prepare(`
    SELECT m.*, p.nom AS produit_nom, a.icone
    FROM mouvements m JOIN produits p ON p.id=m.produit_id JOIN aliments a ON a.id=p.aliment_id
    ORDER BY m.created_at DESC LIMIT 100
  `).all());
});

app.listen(PORT,'0.0.0.0',()=>console.log(`[KitchenCore] v0.4 démarré sur http://0.0.0.0:${PORT}`));
