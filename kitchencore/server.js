/**
 * KitchenCore v0.3 – Interface Web avancée embarquée
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
    icone        TEXT    DEFAULT '🥫',
    created_at   TEXT    DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS produits (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    aliment_id   INTEGER NOT NULL REFERENCES aliments(id),
    nom          TEXT    NOT NULL,
    marque       TEXT,
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
  CREATE TABLE IF NOT EXISTS mouvements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    produit_id INTEGER NOT NULL,
    type       TEXT    NOT NULL,
    delta      INTEGER NOT NULL,
    source     TEXT    DEFAULT 'web',
    created_at TEXT    DEFAULT (datetime('now'))
  );
`);

app.use(express.json());
app.use((_req, res, next) => { res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); next(); });

// ════════════════════════════════════════════════════════════════════════════════
// INTERFACE WEB
// ════════════════════════════════════════════════════════════════════════════════
const HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KitchenCore</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;800&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
/* ════ RESET & VARIABLES ════════════════════════════════════════════════════ */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:        #0d0f0e;
  --bg2:       #131614;
  --surface:   #1a1e1b;
  --surface2:  #212620;
  --border:    #2a302a;
  --border2:   #343d34;
  --green:     #4ade80;
  --green-dim: #22c55e;
  --green-glow:rgba(74,222,128,.15);
  --amber:     #fbbf24;
  --red:       #f87171;
  --text:      #e8ede9;
  --text2:     #8a9e8c;
  --text3:     #4d5e4f;
  --radius:    10px;
  --font-head: 'Unbounded', sans-serif;
  --font-body: 'Instrument Sans', sans-serif;
}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:var(--font-body);min-height:100vh;overflow-x:hidden}

/* ════ SCROLLBAR ════════════════════════════════════════════════════════════ */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:var(--bg2)}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}

/* ════ LAYOUT ═══════════════════════════════════════════════════════════════ */
.shell{display:grid;grid-template-columns:220px 1fr;min-height:100vh}

/* ════ SIDEBAR ══════════════════════════════════════════════════════════════ */
.sidebar{
  background:var(--bg2);
  border-right:1px solid var(--border);
  display:flex;flex-direction:column;
  padding:1.5rem 1rem;
  position:sticky;top:0;height:100vh;
  overflow-y:auto;
}
.logo{
  font-family:var(--font-head);font-size:.95rem;font-weight:800;
  color:var(--green);letter-spacing:-.02em;
  display:flex;align-items:center;gap:.6rem;margin-bottom:2rem;
  padding:.5rem .8rem;
}
.logo-icon{
  width:36px;height:36px;background:var(--green-glow);border:1px solid var(--green);
  border-radius:8px;display:grid;place-items:center;font-size:1.1rem;flex-shrink:0;
}
.nav-section{font-size:.65rem;font-weight:600;letter-spacing:.12em;color:var(--text3);text-transform:uppercase;padding:.4rem .8rem;margin-top:.5rem}
.nav-item{
  display:flex;align-items:center;gap:.7rem;padding:.65rem .8rem;border-radius:8px;
  cursor:pointer;font-size:.85rem;font-weight:500;color:var(--text2);
  transition:all .15s;margin-bottom:2px;border:1px solid transparent;
  user-select:none;
}
.nav-item:hover{background:var(--surface);color:var(--text)}
.nav-item.active{background:var(--green-glow);color:var(--green);border-color:rgba(74,222,128,.2)}
.nav-icon{font-size:1rem;width:20px;text-align:center}
.sidebar-footer{margin-top:auto;padding-top:1rem;border-top:1px solid var(--border)}
.version{font-size:.72rem;color:var(--text3);padding:.4rem .8rem}

/* ════ MAIN ═════════════════════════════════════════════════════════════════ */
.main{padding:2rem 2.5rem;overflow-y:auto;max-height:100vh}

/* ════ PAGE HEADER ══════════════════════════════════════════════════════════ */
.page-head{margin-bottom:2rem}
.page-title{font-family:var(--font-head);font-size:1.6rem;font-weight:800;letter-spacing:-.04em;color:var(--text);line-height:1}
.page-title span{color:var(--green)}
.page-sub{color:var(--text2);font-size:.88rem;margin-top:.5rem}

/* ════ PAGES ════════════════════════════════════════════════════════════════ */
.page{display:none;animation:fadeIn .2s ease}
.page.active{display:block}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

/* ════ STATS GRID ═══════════════════════════════════════════════════════════ */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem}
.stat{
  background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:1.2rem 1.4rem;position:relative;overflow:hidden;
}
.stat::before{
  content:'';position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,var(--green),transparent);
}
.stat.warn::before{background:linear-gradient(90deg,var(--amber),transparent)}
.stat.danger::before{background:linear-gradient(90deg,var(--red),transparent)}
.stat-icon{font-size:1.4rem;margin-bottom:.6rem}
.stat-val{font-family:var(--font-head);font-size:2rem;font-weight:800;line-height:1;letter-spacing:-.04em}
.stat.warn .stat-val{color:var(--amber)}
.stat.danger .stat-val{color:var(--red)}
.stat.ok .stat-val{color:var(--green)}
.stat-label{color:var(--text2);font-size:.78rem;margin-top:.35rem}

/* ════ CARD ═════════════════════════════════════════════════════════════════ */
.card{
  background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  margin-bottom:1.5rem;overflow:hidden;
}
.card-head{
  display:flex;justify-content:space-between;align-items:center;
  padding:1rem 1.4rem;border-bottom:1px solid var(--border);
}
.card-title{font-family:var(--font-head);font-size:.82rem;font-weight:600;letter-spacing:-.01em;color:var(--text)}
.card-body{padding:1.4rem}
.card-actions{display:flex;gap:.5rem;align-items:center}

/* ════ TABLE ════════════════════════════════════════════════════════════════ */
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.87rem}
thead th{
  text-align:left;padding:.65rem 1rem;
  font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  color:var(--text3);border-bottom:1px solid var(--border);
  white-space:nowrap;
}
tbody td{padding:.8rem 1rem;border-bottom:1px solid var(--border);vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr{transition:background .1s}
tbody tr:hover td{background:var(--surface2)}

/* ════ BADGES ═══════════════════════════════════════════════════════════════ */
.badge{
  display:inline-flex;align-items:center;gap:.3rem;
  padding:.2rem .65rem;border-radius:99px;font-size:.73rem;font-weight:600;
  white-space:nowrap;
}
.badge-ok    {background:rgba(74,222,128,.12);color:var(--green);border:1px solid rgba(74,222,128,.25)}
.badge-warn  {background:rgba(251,191,36,.1);color:var(--amber);border:1px solid rgba(251,191,36,.25)}
.badge-red   {background:rgba(248,113,113,.1);color:var(--red);border:1px solid rgba(248,113,113,.2)}
.badge-muted {background:var(--surface2);color:var(--text2);border:1px solid var(--border)}

/* ════ BUTTONS ══════════════════════════════════════════════════════════════ */
.btn{
  display:inline-flex;align-items:center;gap:.4rem;
  padding:.55rem 1.2rem;border-radius:8px;border:none;cursor:pointer;
  font-size:.83rem;font-weight:600;font-family:var(--font-body);
  transition:all .15s;white-space:nowrap;
}
.btn-primary{background:var(--green);color:#0d0f0e}
.btn-primary:hover{background:#6ee7a0;box-shadow:0 0 20px var(--green-glow)}
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border)}
.btn-ghost:hover{border-color:var(--border2);color:var(--text);background:var(--surface2)}
.btn-danger{background:transparent;color:var(--red);border:1px solid rgba(248,113,113,.2)}
.btn-danger:hover{background:rgba(248,113,113,.1)}
.btn-amber{background:transparent;color:var(--amber);border:1px solid rgba(251,191,36,.2)}
.btn-amber:hover{background:rgba(251,191,36,.08)}
.btn-icon{padding:.45rem .6rem;font-size:.9rem}
.btn-sm{padding:.35rem .8rem;font-size:.78rem}
.btn:disabled{opacity:.4;cursor:not-allowed}

/* ════ FORMS ════════════════════════════════════════════════════════════════ */
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.form-grid.cols3{grid-template-columns:1fr 1fr 1fr}
.fg{display:flex;flex-direction:column;gap:.45rem}
.fg.full{grid-column:1/-1}
label{font-size:.75rem;font-weight:600;color:var(--text2);letter-spacing:.03em}
input,select,textarea{
  background:var(--bg2);border:1.5px solid var(--border);border-radius:8px;
  color:var(--text);font-family:var(--font-body);font-size:.88rem;
  padding:.65rem .9rem;outline:none;transition:border-color .15s,box-shadow .15s;
  width:100%;
}
input::placeholder{color:var(--text3)}
input:focus,select:focus,textarea:focus{
  border-color:var(--green-dim);
  box-shadow:0 0 0 3px rgba(74,222,128,.1);
}
select option{background:var(--bg2)}

/* ════ STOCK CONTROLS ═══════════════════════════════════════════════════════ */
.qty-ctrl{display:inline-flex;align-items:center;gap:.5rem}
.qty-btn{
  width:26px;height:26px;border-radius:6px;border:1px solid var(--border);
  background:var(--surface2);color:var(--text);cursor:pointer;
  display:grid;place-items:center;font-size:1rem;font-weight:700;
  transition:all .12s;line-height:1;flex-shrink:0;
}
.qty-btn:hover{border-color:var(--green-dim);color:var(--green);background:var(--green-glow)}
.qty-val{font-family:var(--font-head);font-size:.95rem;font-weight:800;min-width:28px;text-align:center;color:var(--text)}

/* ════ TOAST ════════════════════════════════════════════════════════════════ */
#toast-container{position:fixed;bottom:1.5rem;right:1.5rem;z-index:999;display:flex;flex-direction:column;gap:.5rem}
.toast{
  background:var(--surface2);border:1px solid var(--border2);border-radius:10px;
  padding:.85rem 1.2rem;font-size:.85rem;min-width:260px;max-width:360px;
  display:flex;align-items:center;gap:.6rem;
  animation:slideIn .25s ease;box-shadow:0 8px 32px rgba(0,0,0,.5);
}
.toast.ok  {border-left:3px solid var(--green);color:var(--text)}
.toast.err {border-left:3px solid var(--red);color:var(--red)}
.toast.warn{border-left:3px solid var(--amber);color:var(--amber)}
@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
@keyframes fadeOut{to{opacity:0;transform:translateY(8px)}}

/* ════ MODAL ════════════════════════════════════════════════════════════════ */
.modal-bg{
  position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:100;
  display:none;place-items:center;backdrop-filter:blur(4px);
}
.modal-bg.open{display:grid}
.modal{
  background:var(--surface);border:1px solid var(--border2);border-radius:14px;
  padding:2rem;width:min(520px,95vw);
  animation:fadeIn .2s ease;box-shadow:0 24px 80px rgba(0,0,0,.6);
}
.modal-title{font-family:var(--font-head);font-size:1rem;font-weight:700;margin-bottom:1.4rem;color:var(--text)}
.modal-actions{display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.4rem}

/* ════ PROGRESS BAR ═════════════════════════════════════════════════════════ */
.progress-wrap{background:var(--bg2);border-radius:99px;height:6px;overflow:hidden;flex:1;min-width:60px}
.progress-bar{height:100%;border-radius:99px;transition:width .4s ease;background:var(--green)}
.progress-bar.warn{background:var(--amber)}
.progress-bar.danger{background:var(--red)}

/* ════ HISTORIQUE ═══════════════════════════════════════════════════════════ */
.timeline{display:flex;flex-direction:column;gap:.6rem}
.tl-item{display:flex;gap:.8rem;align-items:flex-start;padding:.7rem;border-radius:8px;background:var(--surface2);border:1px solid var(--border)}
.tl-icon{width:28px;height:28px;border-radius:6px;display:grid;place-items:center;font-size:.85rem;flex-shrink:0}
.tl-icon.add{background:rgba(74,222,128,.12);color:var(--green)}
.tl-icon.sub{background:rgba(248,113,113,.1);color:var(--red)}
.tl-icon.iot{background:rgba(251,191,36,.1);color:var(--amber)}
.tl-body{flex:1;min-width:0}
.tl-name{font-size:.85rem;font-weight:500;color:var(--text)}
.tl-meta{font-size:.75rem;color:var(--text3);margin-top:.1rem}

/* ════ IOT PAGE ════════════════════════════════════════════════════════════ */
.iot-box{
  background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:2.5rem;text-align:center;max-width:420px;
}
.iot-scan-icon{font-size:3.5rem;margin-bottom:1rem;filter:drop-shadow(0 0 20px var(--green))}
.iot-input{
  font-size:1.3rem;font-family:monospace;text-align:center;letter-spacing:.1em;
  padding:.8rem;margin:1rem 0;
}
.iot-result{
  background:var(--bg2);border:1px solid var(--border);border-radius:8px;
  padding:1rem;font-family:monospace;font-size:.8rem;text-align:left;
  color:var(--green);margin-top:1rem;white-space:pre-wrap;display:none;max-height:200px;overflow-y:auto;
}

/* ════ EMPTY STATE ══════════════════════════════════════════════════════════ */
.empty{padding:3rem 1rem;text-align:center;color:var(--text3)}
.empty-icon{font-size:2.5rem;margin-bottom:.6rem;opacity:.4}
.empty p{font-size:.88rem}

/* ════ RESPONSIVE ═══════════════════════════════════════════════════════════ */
@media(max-width:768px){
  .shell{grid-template-columns:1fr}
  .sidebar{height:auto;position:static;flex-direction:row;flex-wrap:wrap;padding:1rem;gap:.3rem}
  .logo{margin-bottom:0}
  .nav-section{display:none}
  .main{padding:1.2rem}
  .stats{grid-template-columns:1fr 1fr}
  .form-grid{grid-template-columns:1fr}
  .form-grid.cols3{grid-template-columns:1fr}
}
</style>
</head>
<body>

<div id="toast-container"></div>

<!-- ═══ MODALS ═════════════════════════════════════════════════════════════ -->
<div id="modal-aliment" class="modal-bg">
  <div class="modal">
    <div class="modal-title">🫙 Modifier l'aliment</div>
    <input type="hidden" id="edit-a-id">
    <div class="form-grid" style="margin-bottom:0">
      <div class="fg"><label>Nom</label><input id="edit-a-nom"></div>
      <div class="fg"><label>Catégorie</label>
        <select id="edit-a-cat">
          <option>Produits laitiers</option><option>Viandes &amp; Poissons</option>
          <option>Fruits &amp; Légumes</option><option>Épicerie</option>
          <option>Boissons</option><option>Surgelés</option><option>Autre</option>
        </select>
      </div>
      <div class="fg"><label>Seuil d'alerte</label><input id="edit-a-seuil" type="number" min="0" step="0.5"></div>
      <div class="fg"><label>Icône (emoji)</label><input id="edit-a-icone" maxlength="4"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('modal-aliment')">Annuler</button>
      <button class="btn btn-primary" onclick="saveAliment()">Enregistrer</button>
    </div>
  </div>
</div>

<div id="modal-produit" class="modal-bg">
  <div class="modal">
    <div class="modal-title">🏷️ Modifier le produit</div>
    <input type="hidden" id="edit-p-id">
    <div class="form-grid">
      <div class="fg"><label>Nom commercial</label><input id="edit-p-nom"></div>
      <div class="fg"><label>Marque</label><input id="edit-p-marque"></div>
      <div class="fg"><label>Code-barres</label><input id="edit-p-barcode"></div>
      <div class="fg"><label>Contenance (u./pack)</label><input id="edit-p-contenance" type="number" min="1"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('modal-produit')">Annuler</button>
      <button class="btn btn-primary" onclick="saveProduit()">Enregistrer</button>
    </div>
  </div>
</div>

<div id="modal-stock" class="modal-bg">
  <div class="modal">
    <div class="modal-title" id="modal-stock-title">📦 Ajuster le stock</div>
    <div id="modal-stock-info" style="color:var(--text2);font-size:.85rem;margin-bottom:1.2rem"></div>
    <div class="form-grid">
      <div class="fg"><label>Packs pleins</label><input id="ms-packs" type="number" min="0"></div>
      <div class="fg"><label>Unités dans le pack ouvert</label><input id="ms-unites" type="number" min="0"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('modal-stock')">Annuler</button>
      <button class="btn btn-primary" onclick="saveStock()">Mettre à jour</button>
    </div>
  </div>
</div>

<!-- ═══ SHELL ═══════════════════════════════════════════════════════════════ -->
<div class="shell">

  <!-- SIDEBAR -->
  <nav class="sidebar">
    <div class="logo"><div class="logo-icon">🥦</div>KitchenCore</div>
    <div class="nav-section">Principal</div>
    <div class="nav-item active" data-page="dashboard" onclick="nav(this,'dashboard')"><span class="nav-icon">◈</span>Tableau de bord</div>
    <div class="nav-item" data-page="stocks" onclick="nav(this,'stocks')"><span class="nav-icon">📦</span>Stocks</div>
    <div class="nav-section">Catalogue</div>
    <div class="nav-item" data-page="aliments" onclick="nav(this,'aliments')"><span class="nav-icon">🫙</span>Aliments</div>
    <div class="nav-item" data-page="produits" onclick="nav(this,'produits')"><span class="nav-icon">🏷️</span>Produits</div>
    <div class="nav-section">IoT</div>
    <div class="nav-item" data-page="iot" onclick="nav(this,'iot')"><span class="nav-icon">📡</span>Scanner</div>
    <div class="nav-item" data-page="historique" onclick="nav(this,'historique')"><span class="nav-icon">📋</span>Historique</div>
    <div class="sidebar-footer">
      <div class="version">KitchenCore v0.3</div>
    </div>
  </nav>

  <!-- MAIN -->
  <main class="main">

    <!-- ══ DASHBOARD ══════════════════════════════════════════════════════════ -->
    <div id="page-dashboard" class="page active">
      <div class="page-head">
        <h1 class="page-title">Tableau de <span>bord</span></h1>
        <p class="page-sub">Vue d'ensemble de votre inventaire alimentaire.</p>
      </div>
      <div class="stats" id="dash-stats">
        <div class="stat"><div class="stat-icon">⏳</div><div class="stat-val">—</div><div class="stat-label">Chargement…</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
        <div class="card">
          <div class="card-head"><span class="card-title">⚠️ Alertes de stock</span></div>
          <div class="card-body" id="dash-alertes"></div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title">📋 Derniers mouvements</span></div>
          <div class="card-body" id="dash-mouvements"></div>
        </div>
      </div>
      <div class="card" style="margin-top:1.5rem">
        <div class="card-head"><span class="card-title">📊 Niveaux de stock par aliment</span></div>
        <div class="card-body" id="dash-jauge"></div>
      </div>
    </div>

    <!-- ══ STOCKS ═════════════════════════════════════════════════════════════ -->
    <div id="page-stocks" class="page">
      <div class="page-head">
        <h1 class="page-title"><span>Stocks</span> — Inventaire</h1>
        <p class="page-sub">Gérez les quantités de chaque produit en temps réel.</p>
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">Tous les produits</span>
          <div class="card-actions">
            <input id="stock-search" placeholder="🔍 Filtrer…" style="width:180px;padding:.4rem .8rem;font-size:.82rem" oninput="filterStocks()">
            <button class="btn btn-ghost btn-sm" onclick="loadStocks()">↻</button>
          </div>
        </div>
        <div class="card-body" style="padding:0"><div class="tbl-wrap" id="stocks-table"></div></div>
      </div>
    </div>

    <!-- ══ ALIMENTS ═══════════════════════════════════════════════════════════ -->
    <div id="page-aliments" class="page">
      <div class="page-head">
        <h1 class="page-title"><span>Aliments</span></h1>
        <p class="page-sub">Niveau 1 — Le concept générique. Ex : "Lait demi-écrémé", "Yaourt nature".</p>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">➕ Créer un aliment</span></div>
        <div class="card-body">
          <div class="form-grid cols3">
            <div class="fg"><label>Nom *</label><input id="a-nom" placeholder="ex: Lait demi-écrémé"></div>
            <div class="fg"><label>Catégorie</label>
              <select id="a-cat">
                <option>Produits laitiers</option><option>Viandes &amp; Poissons</option>
                <option>Fruits &amp; Légumes</option><option>Épicerie</option>
                <option>Boissons</option><option>Surgelés</option><option>Autre</option>
              </select>
            </div>
            <div class="fg"><label>Seuil d'alerte</label><input id="a-seuil" type="number" value="2" min="0" step="0.5" placeholder="2"></div>
            <div class="fg"><label>Icône (emoji)</label><input id="a-icone" placeholder="🥛" maxlength="4" style="font-size:1.3rem;text-align:center"></div>
          </div>
          <button class="btn btn-primary" style="margin-top:1.2rem" onclick="creerAliment()">✓ Créer l'aliment</button>
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">Liste</span>
          <button class="btn btn-ghost btn-sm" onclick="loadAliments()">↻ Rafraîchir</button>
        </div>
        <div class="card-body" style="padding:0"><div class="tbl-wrap" id="aliments-table"></div></div>
      </div>
    </div>

    <!-- ══ PRODUITS ═══════════════════════════════════════════════════════════ -->
    <div id="page-produits" class="page">
      <div class="page-head">
        <h1 class="page-title"><span>Produits</span></h1>
        <p class="page-sub">Niveau 2 — La référence commerciale avec code-barres EAN.</p>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">➕ Créer un produit</span></div>
        <div class="card-body">
          <div class="form-grid cols3">
            <div class="fg"><label>Aliment parent *</label><select id="p-aliment"><option value="">— Sélectionner —</option></select></div>
            <div class="fg"><label>Nom commercial *</label><input id="p-nom" placeholder="ex: Lait Lactel 1L"></div>
            <div class="fg"><label>Marque</label><input id="p-marque" placeholder="ex: Lactel"></div>
            <div class="fg"><label>Code-barres EAN</label><input id="p-barcode" placeholder="ex: 3451030003445" style="font-family:monospace"></div>
            <div class="fg"><label>Contenance (unités/pack)</label><input id="p-contenance" type="number" value="1" min="1"></div>
          </div>
          <button class="btn btn-primary" style="margin-top:1.2rem" onclick="creerProduit()">✓ Créer le produit</button>
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">Liste</span>
          <button class="btn btn-ghost btn-sm" onclick="loadProduits()">↻ Rafraîchir</button>
        </div>
        <div class="card-body" style="padding:0"><div class="tbl-wrap" id="produits-table"></div></div>
      </div>
    </div>

    <!-- ══ IOT ════════════════════════════════════════════════════════════════ -->
    <div id="page-iot" class="page">
      <div class="page-head">
        <h1 class="page-title">Scanner <span>IoT</span></h1>
        <p class="page-sub">Simulez un scan de code-barres comme votre boîtier ESP32.</p>
      </div>
      <div style="display:flex;justify-content:center">
        <div class="iot-box">
          <div class="iot-scan-icon">📡</div>
          <h2 style="font-family:var(--font-head);font-size:1rem;font-weight:700;margin-bottom:.5rem">Simuler un scan</h2>
          <p style="color:var(--text2);font-size:.83rem;margin-bottom:1.2rem">Entrez un code-barres EAN-13 pour déclencher la décrémentation automatique.</p>
          <input class="iot-input" id="iot-barcode" placeholder="0000000000000" maxlength="16" oninput="this.value=this.value.replace(/\\D/g,'')">
          <button class="btn btn-primary" style="width:100%;justify-content:center;padding:.9rem" onclick="scanIot()">🔍 Envoyer le scan</button>
          <pre class="iot-result" id="iot-result"></pre>
        </div>
      </div>
    </div>

    <!-- ══ HISTORIQUE ═════════════════════════════════════════════════════════ -->
    <div id="page-historique" class="page">
      <div class="page-head">
        <h1 class="page-title"><span>Historique</span></h1>
        <p class="page-sub">Tous les mouvements de stock enregistrés.</p>
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">Mouvements récents</span>
          <button class="btn btn-ghost btn-sm" onclick="loadHistorique()">↻ Rafraîchir</button>
        </div>
        <div class="card-body" id="historique-list"></div>
      </div>
    </div>

  </main>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<script>
// ── État global ──────────────────────────────────────────────────────────────
let _stocks = [];
let _editStockId = null;

// ── Navigation ───────────────────────────────────────────────────────────────
function nav(el, page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  el.classList.add('active');
  const loaders = { dashboard: loadDashboard, stocks: loadStocks, aliments: loadAliments, produits: () => { loadProduits(); fillAlimentSelect(); }, historique: loadHistorique };
  if (loaders[page]) loaders[page]();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'ok') {
  const icons = { ok: '✓', err: '✕', warn: '⚠' };
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = '<span>' + icons[type] + '</span><span>' + msg + '</span>';
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => { t.style.animation = 'fadeOut .3s ease forwards'; setTimeout(() => t.remove(), 300); }, 3200);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-bg').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));

// ── API ───────────────────────────────────────────────────────────────────────
async function api(method, url, body) {
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return await r.json();
  } catch (e) { return { error: 'Erreur réseau : ' + e.message }; }
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
async function loadDashboard() {
  const [aliments, stocks, mvts] = await Promise.all([
    api('GET', '/api/aliments'), api('GET', '/api/stocks'), api('GET', '/api/mouvements')
  ]);
  const alertes = stocks.filter(s => s.total_unites < s.seuil_alerte);
  const total_packs = stocks.reduce((a, s) => a + s.packs_pleins, 0);

  document.getElementById('dash-stats').innerHTML = \`
    <div class="stat ok"><div class="stat-icon">🫙</div><div class="stat-val">\${aliments.length}</div><div class="stat-label">Aliments</div></div>
    <div class="stat ok"><div class="stat-icon">🏷️</div><div class="stat-val">\${stocks.length}</div><div class="stat-label">Produits</div></div>
    <div class="stat ok"><div class="stat-icon">📦</div><div class="stat-val">\${total_packs}</div><div class="stat-label">Packs pleins</div></div>
    <div class="stat \${alertes.length > 0 ? 'danger' : 'ok'}"><div class="stat-icon">\${alertes.length > 0 ? '⚠️' : '✅'}</div><div class="stat-val">\${alertes.length}</div><div class="stat-label">Alertes</div></div>
  \`;

  // Alertes
  const al = document.getElementById('dash-alertes');
  if (!alertes.length) {
    al.innerHTML = '<div class="empty"><div class="empty-icon">✅</div><p>Tous les stocks sont au-dessus du seuil.</p></div>';
  } else {
    al.innerHTML = alertes.map(s => \`
      <div style="display:flex;align-items:center;gap:.8rem;padding:.7rem 0;border-bottom:1px solid var(--border)">
        <span style="font-size:1.3rem">\${s.icone || '🥫'}</span>
        <div style="flex:1">
          <div style="font-size:.85rem;font-weight:500">\${s.produit_nom}</div>
          <div style="font-size:.75rem;color:var(--text3)">\${s.aliment_nom}</div>
        </div>
        <span class="badge badge-red">\${s.total_unites} / \${s.seuil_alerte}</span>
      </div>
    \`).join('');
  }

  // Mouvements récents
  const mv = document.getElementById('dash-mouvements');
  if (!mvts.length) {
    mv.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><p>Aucun mouvement enregistré.</p></div>';
  } else {
    mv.innerHTML = mvts.slice(0, 6).map(m => \`
      <div style="display:flex;align-items:center;gap:.7rem;padding:.55rem 0;border-bottom:1px solid var(--border)">
        <span class="badge \${m.delta > 0 ? 'badge-ok' : m.source === 'iot' ? 'badge-warn' : 'badge-red'}">\${m.delta > 0 ? '+'+m.delta : m.delta}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:.82rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\${m.produit_nom}</div>
          <div style="font-size:.72rem;color:var(--text3)">\${m.source} · \${new Date(m.created_at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      </div>
    \`).join('');
  }

  // Jauges
  const jg = document.getElementById('dash-jauge');
  if (!aliments.length) { jg.innerHTML = '<div class="empty"><div class="empty-icon">🫙</div><p>Aucun aliment créé.</p></div>'; return; }
  jg.innerHTML = aliments.map(a => {
    const pct = Math.min(100, a.seuil_alerte > 0 ? (a.stock_total / a.seuil_alerte) * 100 : 100);
    const cls = pct < 50 ? 'danger' : pct < 100 ? 'warn' : '';
    return \`<div style="display:flex;align-items:center;gap:1rem;padding:.55rem 0;border-bottom:1px solid var(--border)">
      <span style="font-size:1.1rem;width:24px;text-align:center">\${a.icone || '🥫'}</span>
      <span style="font-size:.85rem;font-weight:500;min-width:160px;flex-shrink:0">\${a.nom}</span>
      <div class="progress-wrap">
        <div class="progress-bar \${cls}" style="width:\${Math.max(2,pct)}%"></div>
      </div>
      <span style="font-size:.8rem;color:var(--text2);min-width:60px;text-align:right">\${a.stock_total} / \${a.seuil_alerte}</span>
    </div>\`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════════════════
// STOCKS
// ════════════════════════════════════════════════════════════════════════════
async function loadStocks() {
  _stocks = await api('GET', '/api/stocks');
  renderStocks(_stocks);
}

function filterStocks() {
  const q = document.getElementById('stock-search').value.toLowerCase();
  renderStocks(_stocks.filter(s => s.produit_nom.toLowerCase().includes(q) || s.aliment_nom.toLowerCase().includes(q)));
}

function renderStocks(rows) {
  const el = document.getElementById('stocks-table');
  if (!rows.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">📦</div><p>Aucun produit. Créez d\'abord des aliments et produits.</p></div>'; return; }
  el.innerHTML = \`<table>
    <thead><tr><th>Produit</th><th>Packs pleins</th><th>Unités ouvertes</th><th>Total</th><th>Niveau</th><th>État</th><th>Actions</th></tr></thead>
    <tbody>\${rows.map(r => {
      const total = r.total_unites;
      const pct = Math.min(100, r.seuil_alerte > 0 ? (total / r.seuil_alerte) * 100 : 100);
      const cls = pct < 50 ? 'danger' : pct < 100 ? 'warn' : '';
      return \`<tr>
        <td>
          <div style="font-weight:600">\${r.icone || ''} \${r.produit_nom}</div>
          <div style="font-size:.75rem;color:var(--text3)">\${r.aliment_nom}</div>
        </td>
        <td>
          <div class="qty-ctrl">
            <button class="qty-btn" onclick="ajuster(\${r.produit_id},'packs',-1)">−</button>
            <span class="qty-val" id="pk-\${r.produit_id}">\${r.packs_pleins}</span>
            <button class="qty-btn" onclick="ajuster(\${r.produit_id},'packs',1)">+</button>
          </div>
        </td>
        <td>
          <div class="qty-ctrl">
            <button class="qty-btn" onclick="consommer(\${r.produit_id})">−</button>
            <span class="qty-val" id="un-\${r.produit_id}">\${r.unites_ouvert}</span>
            <button class="qty-btn" onclick="ajuster(\${r.produit_id},'unites',1)">+</button>
          </div>
        </td>
        <td><span style="font-family:var(--font-head);font-weight:800;font-size:1rem" id="tot-\${r.produit_id}">\${total}</span></td>
        <td style="min-width:100px">
          <div class="progress-wrap"><div class="progress-bar \${cls}" style="width:\${Math.max(2,pct)}%"></div></div>
        </td>
        <td>\${total < r.seuil_alerte ? '<span class="badge badge-red">⚠ Alerte</span>' : '<span class="badge badge-ok">✓ OK</span>'}</td>
        <td>
          <div style="display:flex;gap:.3rem">
            <button class="btn btn-ghost btn-icon btn-sm" onclick="openStockModal(\${r.produit_id},'\${r.produit_nom}',\${r.packs_pleins},\${r.unites_ouvert})" title="Corriger">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="consommer(\${r.produit_id})">−1</button>
          </div>
        </td>
      </tr>\`;
    }).join('')}</tbody>
  </table>\`;
}

async function ajuster(id, type, delta) {
  const body = type === 'packs' ? { packs: delta, unites: 0 } : { packs: 0, unites: delta };
  const r = await api('POST', \`/api/stocks/\${id}/ajouter\`, body);
  if (r.error) return toast(r.error, 'err');
  await loadStocks();
}

async function consommer(id) {
  const r = await api('POST', \`/api/stocks/\${id}/consommer\`, {});
  if (r.error) return toast(r.error, 'err');
  if (r.pack_deballe) toast('📦 Pack déballé automatiquement !', 'warn');
  else toast('Consommation enregistrée', 'ok');
  await loadStocks();
}

function openStockModal(id, nom, packs, unites) {
  _editStockId = id;
  document.getElementById('modal-stock-title').textContent = '📦 ' + nom;
  document.getElementById('modal-stock-info').textContent = 'Correction manuelle du stock pour ce produit.';
  document.getElementById('ms-packs').value = packs;
  document.getElementById('ms-unites').value = unites;
  openModal('modal-stock');
}

async function saveStock() {
  const r = await api('POST', \`/api/stocks/\${_editStockId}/corriger\`, {
    packs_pleins: parseInt(document.getElementById('ms-packs').value) || 0,
    unites_ouvert: parseInt(document.getElementById('ms-unites').value) || 0,
  });
  if (r.error) return toast(r.error, 'err');
  toast('Stock mis à jour', 'ok');
  closeModal('modal-stock');
  loadStocks();
}

// ════════════════════════════════════════════════════════════════════════════
// ALIMENTS
// ════════════════════════════════════════════════════════════════════════════
async function loadAliments() {
  const rows = await api('GET', '/api/aliments');
  const el = document.getElementById('aliments-table');
  if (!rows.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">🫙</div><p>Aucun aliment. Créez-en un ci-dessus.</p></div>'; return; }
  el.innerHTML = \`<table>
    <thead><tr><th>Icône</th><th>Nom</th><th>Catégorie</th><th>Stock total</th><th>Seuil</th><th>État</th><th>Actions</th></tr></thead>
    <tbody>\${rows.map(r => \`<tr>
      <td style="font-size:1.4rem;text-align:center">\${r.icone || '🥫'}</td>
      <td><strong>\${r.nom}</strong></td>
      <td><span class="badge badge-muted">\${r.categorie}</span></td>
      <td style="font-family:var(--font-head);font-weight:700">\${r.stock_total ?? 0}</td>
      <td>\${r.seuil_alerte}</td>
      <td>\${(r.stock_total ?? 0) < r.seuil_alerte ? '<span class="badge badge-red">⚠ Alerte</span>' : '<span class="badge badge-ok">✓ OK</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="editAliment(\${r.id},'\${r.nom.replace(/'/g,"\\\\'")}','\${r.categorie}',\${r.seuil_alerte},'\${r.icone||'🥫'}')">✏️ Modifier</button></td>
    </tr>\`).join('')}</tbody>
  </table>\`;
}

async function creerAliment() {
  const nom = document.getElementById('a-nom').value.trim();
  if (!nom) return toast('Le nom est obligatoire.', 'err');
  const r = await api('POST', '/api/aliments', {
    nom, categorie: document.getElementById('a-cat').value,
    seuil_alerte: parseFloat(document.getElementById('a-seuil').value) || 1,
    icone: document.getElementById('a-icone').value || '🥫',
  });
  if (r.error) return toast(r.error, 'err');
  toast(\`"\${r.nom}" créé ✓\`, 'ok');
  document.getElementById('a-nom').value = '';
  document.getElementById('a-icone').value = '';
  loadAliments();
}

function editAliment(id, nom, cat, seuil, icone) {
  document.getElementById('edit-a-id').value = id;
  document.getElementById('edit-a-nom').value = nom;
  document.getElementById('edit-a-cat').value = cat;
  document.getElementById('edit-a-seuil').value = seuil;
  document.getElementById('edit-a-icone').value = icone;
  openModal('modal-aliment');
}

async function saveAliment() {
  const id = document.getElementById('edit-a-id').value;
  const r = await api('PATCH', \`/api/aliments/\${id}\`, {
    nom: document.getElementById('edit-a-nom').value.trim(),
    categorie: document.getElementById('edit-a-cat').value,
    seuil_alerte: parseFloat(document.getElementById('edit-a-seuil').value),
    icone: document.getElementById('edit-a-icone').value,
  });
  if (r.error) return toast(r.error, 'err');
  toast('Aliment mis à jour ✓', 'ok');
  closeModal('modal-aliment');
  loadAliments();
}

// ════════════════════════════════════════════════════════════════════════════
// PRODUITS
// ════════════════════════════════════════════════════════════════════════════
async function fillAlimentSelect() {
  const rows = await api('GET', '/api/aliments');
  const sel = document.getElementById('p-aliment');
  sel.innerHTML = '<option value="">— Sélectionner —</option>' + rows.map(r => \`<option value="\${r.id}">\${r.icone || ''} \${r.nom}</option>\`).join('');
}

async function loadProduits() {
  const rows = await api('GET', '/api/produits');
  const el = document.getElementById('produits-table');
  if (!rows.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">🏷️</div><p>Aucun produit. Créez d\'abord un aliment.</p></div>'; return; }
  el.innerHTML = \`<table>
    <thead><tr><th>Produit</th><th>Aliment</th><th>Marque</th><th>Code-barres</th><th>Contenance</th><th>Actions</th></tr></thead>
    <tbody>\${rows.map(r => \`<tr>
      <td><strong>\${r.nom}</strong></td>
      <td><span class="badge badge-muted">\${r.aliment_nom}</span></td>
      <td>\${r.marque || '<span style="color:var(--text3)">—</span>'}</td>
      <td style="font-family:monospace;font-size:.82rem">\${r.code_barres || '<span style="color:var(--text3)">—</span>'}</td>
      <td>\${r.contenance} u.</td>
      <td><button class="btn btn-ghost btn-sm" onclick="editProduit(\${r.id},'\${r.nom.replace(/'/g,"\\\\'")}','\${(r.marque||'').replace(/'/g,"\\\\'")}','\${r.code_barres||''}',\${r.contenance})">✏️ Modifier</button></td>
    </tr>\`).join('')}</tbody>
  </table>\`;
}

async function creerProduit() {
  const aliment_id = document.getElementById('p-aliment').value;
  const nom = document.getElementById('p-nom').value.trim();
  if (!aliment_id || !nom) return toast('Aliment et nom sont obligatoires.', 'err');
  const r = await api('POST', '/api/produits', {
    aliment_id: parseInt(aliment_id), nom,
    marque: document.getElementById('p-marque').value.trim() || undefined,
    code_barres: document.getElementById('p-barcode').value.trim() || undefined,
    contenance: parseInt(document.getElementById('p-contenance').value) || 1,
  });
  if (r.error) return toast(r.error, 'err');
  toast(\`"\${r.nom}" créé ✓\`, 'ok');
  document.getElementById('p-nom').value = '';
  document.getElementById('p-marque').value = '';
  document.getElementById('p-barcode').value = '';
  loadProduits();
}

function editProduit(id, nom, marque, barcode, contenance) {
  document.getElementById('edit-p-id').value = id;
  document.getElementById('edit-p-nom').value = nom;
  document.getElementById('edit-p-marque').value = marque;
  document.getElementById('edit-p-barcode').value = barcode;
  document.getElementById('edit-p-contenance').value = contenance;
  openModal('modal-produit');
}

async function saveProduit() {
  const id = document.getElementById('edit-p-id').value;
  const r = await api('PATCH', \`/api/produits/\${id}\`, {
    nom: document.getElementById('edit-p-nom').value.trim(),
    marque: document.getElementById('edit-p-marque').value.trim() || null,
    code_barres: document.getElementById('edit-p-barcode').value.trim() || null,
    contenance: parseInt(document.getElementById('edit-p-contenance').value) || 1,
  });
  if (r.error) return toast(r.error, 'err');
  toast('Produit mis à jour ✓', 'ok');
  closeModal('modal-produit');
  loadProduits();
}

// ════════════════════════════════════════════════════════════════════════════
// IOT
// ════════════════════════════════════════════════════════════════════════════
async function scanIot() {
  const code = document.getElementById('iot-barcode').value.trim();
  if (!code) return toast('Entrez un code-barres.', 'err');
  const r = await api('POST', '/api/iot/scan', { code_barres: code });
  const el = document.getElementById('iot-result');
  el.style.display = 'block';
  el.textContent = JSON.stringify(r, null, 2);
  if (r.error) toast(r.error, 'err');
  else { toast('Scan accepté — ' + r.produit_nom, 'ok'); if (r.pack_deballe) toast('📦 Pack déballé !', 'warn'); }
}

document.getElementById('iot-barcode').addEventListener('keydown', e => { if (e.key === 'Enter') scanIot(); });

// ════════════════════════════════════════════════════════════════════════════
// HISTORIQUE
// ════════════════════════════════════════════════════════════════════════════
async function loadHistorique() {
  const rows = await api('GET', '/api/mouvements');
  const el = document.getElementById('historique-list');
  if (!rows.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><p>Aucun mouvement enregistré.</p></div>'; return; }
  el.innerHTML = '<div class="timeline">' + rows.map(m => \`
    <div class="tl-item">
      <div class="tl-icon \${m.delta > 0 ? 'add' : m.source === 'iot' ? 'iot' : 'sub'}">\${m.delta > 0 ? '↑' : m.source === 'iot' ? '📡' : '↓'}</div>
      <div class="tl-body">
        <div class="tl-name">\${m.produit_nom} <span style="font-family:var(--font-head);color:\${m.delta > 0 ? 'var(--green)' : 'var(--red)'};\${''}">\${m.delta > 0 ? '+' : ''}\${m.delta}</span></div>
        <div class="tl-meta">\${m.source} · \${new Date(m.created_at).toLocaleString('fr-FR')}</div>
      </div>
    </div>
  \`).join('') + '</div>';
}

// ════════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════════
loadDashboard();
</script>
</body>
</html>`;

app.get('/', (_req, res) => res.send(HTML));
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '0.3.0' }));

// ── Aliments ──────────────────────────────────────────────────────────────────
app.get('/api/aliments', (_req, res) => {
  res.json(db.prepare(`
    SELECT a.*, COALESCE(SUM((s.packs_pleins*p.contenance)+s.unites_ouvert),0) AS stock_total
    FROM aliments a
    LEFT JOIN produits p ON p.aliment_id=a.id
    LEFT JOIN stocks   s ON s.produit_id=p.id
    GROUP BY a.id ORDER BY a.nom
  `).all());
});
app.post('/api/aliments', (req,res) => {
  const {nom,categorie='Autre',seuil_alerte=1,icone='🥫'} = req.body;
  if (!nom) return res.status(400).json({error:'"nom" est requis.'});
  try {
    const i = db.prepare('INSERT INTO aliments(nom,categorie,seuil_alerte,icone) VALUES(?,?,?,?)').run(nom.trim(),categorie,seuil_alerte,icone);
    res.status(201).json(db.prepare('SELECT * FROM aliments WHERE id=?').get(i.lastInsertRowid));
  } catch(e) { res.status(e.message.includes('UNIQUE')?409:500).json({error:e.message.includes('UNIQUE')?'Aliment déjà existant.':e.message}); }
});
app.patch('/api/aliments/:id', (req,res) => {
  const {nom,categorie,seuil_alerte,icone} = req.body;
  const fields=[]; const vals=[];
  if(nom!==undefined){fields.push('nom=?');vals.push(nom)}
  if(categorie!==undefined){fields.push('categorie=?');vals.push(categorie)}
  if(seuil_alerte!==undefined){fields.push('seuil_alerte=?');vals.push(seuil_alerte)}
  if(icone!==undefined){fields.push('icone=?');vals.push(icone)}
  if(!fields.length) return res.status(400).json({error:'Rien à modifier.'});
  vals.push(req.params.id);
  db.prepare(`UPDATE aliments SET ${fields.join(',')} WHERE id=?`).run(...vals);
  res.json(db.prepare('SELECT * FROM aliments WHERE id=?').get(req.params.id));
});

// ── Produits ──────────────────────────────────────────────────────────────────
app.get('/api/produits', (_req, res) => {
  res.json(db.prepare(`
    SELECT p.*, a.nom AS aliment_nom, a.icone, s.packs_pleins, s.unites_ouvert
    FROM produits p JOIN aliments a ON a.id=p.aliment_id
    LEFT JOIN stocks s ON s.produit_id=p.id ORDER BY a.nom,p.nom
  `).all());
});
app.post('/api/produits', (req,res) => {
  const {aliment_id,nom,marque,code_barres,contenance=1} = req.body;
  if (!aliment_id||!nom) return res.status(400).json({error:'"aliment_id" et "nom" sont requis.'});
  try {
    const i = db.prepare('INSERT INTO produits(aliment_id,nom,marque,code_barres,contenance) VALUES(?,?,?,?,?)').run(aliment_id,nom.trim(),marque||null,code_barres||null,contenance);
    db.prepare('INSERT INTO stocks(produit_id) VALUES(?)').run(i.lastInsertRowid);
    res.status(201).json(db.prepare('SELECT * FROM produits WHERE id=?').get(i.lastInsertRowid));
  } catch(e) { res.status(e.message.includes('UNIQUE')?409:500).json({error:e.message.includes('UNIQUE')?'Code-barres déjà utilisé.':e.message}); }
});
app.patch('/api/produits/:id', (req,res) => {
  const {nom,marque,code_barres,contenance} = req.body;
  const fields=[]; const vals=[];
  if(nom!==undefined){fields.push('nom=?');vals.push(nom)}
  if(marque!==undefined){fields.push('marque=?');vals.push(marque)}
  if(code_barres!==undefined){fields.push('code_barres=?');vals.push(code_barres)}
  if(contenance!==undefined){fields.push('contenance=?');vals.push(contenance)}
  if(!fields.length) return res.status(400).json({error:'Rien à modifier.'});
  vals.push(req.params.id);
  try {
    db.prepare(`UPDATE produits SET ${fields.join(',')} WHERE id=?`).run(...vals);
    res.json(db.prepare('SELECT * FROM produits WHERE id=?').get(req.params.id));
  } catch(e) { res.status(409).json({error:'Code-barres déjà utilisé.'}); }
});

// ── Stocks ────────────────────────────────────────────────────────────────────
app.get('/api/stocks', (_req, res) => {
  res.json(db.prepare(`
    SELECT s.*, p.nom AS produit_nom, p.contenance, a.nom AS aliment_nom, a.seuil_alerte, a.icone,
           ((s.packs_pleins*p.contenance)+s.unites_ouvert) AS total_unites
    FROM stocks s JOIN produits p ON p.id=s.produit_id JOIN aliments a ON a.id=p.aliment_id
  `).all());
});
app.post('/api/stocks/:id/ajouter', (req,res) => {
  const {packs=0,unites=0} = req.body;
  const {id} = req.params;
  db.prepare(`UPDATE stocks SET packs_pleins=MAX(0,packs_pleins+?),unites_ouvert=MAX(0,unites_ouvert+?),updated_at=datetime('now') WHERE produit_id=?`).run(packs,unites,id);
  const delta = Number(packs) + Number(unites);
  if (delta !== 0) db.prepare(`INSERT INTO mouvements(produit_id,type,delta,source) VALUES(?,?,?,'web')`).run(id,delta>0?'ajout':'correction',delta);
  res.json(db.prepare('SELECT * FROM stocks WHERE produit_id=?').get(id));
});
app.post('/api/stocks/:id/consommer', (req,res) => {
  const {id} = req.params;
  const p = db.prepare(`SELECT p.contenance,s.packs_pleins,s.unites_ouvert FROM produits p JOIN stocks s ON s.produit_id=p.id WHERE p.id=?`).get(id);
  if (!p) return res.status(404).json({error:'Introuvable.'});
  let {packs_pleins,unites_ouvert,contenance} = p; let pack_deballe=false;
  unites_ouvert -= 1;
  if (unites_ouvert < 0) {
    if (packs_pleins<=0) return res.status(422).json({error:'Stock vide !'});
    packs_pleins--; unites_ouvert+=contenance; pack_deballe=true;
  }
  db.prepare(`UPDATE stocks SET packs_pleins=?,unites_ouvert=?,updated_at=datetime('now') WHERE produit_id=?`).run(packs_pleins,unites_ouvert,id);
  db.prepare(`INSERT INTO mouvements(produit_id,type,delta,source) VALUES(?,?,?,'web')`).run(id,'consommation',-1);
  res.json({stock:db.prepare('SELECT * FROM stocks WHERE produit_id=?').get(id),pack_deballe});
});
app.post('/api/stocks/:id/corriger', (req,res) => {
  const {packs_pleins=0,unites_ouvert=0} = req.body;
  const {id} = req.params;
  db.prepare(`UPDATE stocks SET packs_pleins=?,unites_ouvert=?,updated_at=datetime('now') WHERE produit_id=?`).run(packs_pleins,unites_ouvert,id);
  db.prepare(`INSERT INTO mouvements(produit_id,type,delta,source) VALUES(?,?,?,'web')`).run(id,'correction',0);
  res.json(db.prepare('SELECT * FROM stocks WHERE produit_id=?').get(id));
});

// ── IoT ───────────────────────────────────────────────────────────────────────
app.post('/api/iot/scan', (req,res) => {
  const {code_barres} = req.body;
  if (!code_barres) return res.status(400).json({error:'"code_barres" est requis.'});
  const p = db.prepare(`SELECT p.*,s.packs_pleins,s.unites_ouvert FROM produits p LEFT JOIN stocks s ON s.produit_id=p.id WHERE p.code_barres=?`).get(code_barres);
  if (!p) return res.status(404).json({error:'Code-barres inconnu.',code_barres});
  let {packs_pleins,unites_ouvert,contenance} = p; let pack_deballe=false;
  unites_ouvert -= 1;
  if (unites_ouvert<0) {
    if (packs_pleins<=0) return res.status(422).json({error:'Stock vide !',produit_nom:p.nom});
    packs_pleins--; unites_ouvert+=contenance; pack_deballe=true;
  }
  db.prepare(`UPDATE stocks SET packs_pleins=?,unites_ouvert=?,updated_at=datetime('now') WHERE produit_id=?`).run(packs_pleins,unites_ouvert,p.id);
  db.prepare(`INSERT INTO mouvements(produit_id,type,delta,source) VALUES(?,?,?,'iot')`).run(p.id,'consommation',-1);
  res.json({ok:true,produit_nom:p.nom,packs_pleins,unites_ouvert,pack_deballe});
});

// ── Mouvements ────────────────────────────────────────────────────────────────
app.get('/api/mouvements', (_req,res) => {
  res.json(db.prepare(`
    SELECT m.*, p.nom AS produit_nom FROM mouvements m
    JOIN produits p ON p.id=m.produit_id
    ORDER BY m.created_at DESC LIMIT 100
  `).all());
});

app.listen(PORT,'0.0.0.0',()=>console.log(`[KitchenCore] ✅ v0.3 démarré sur http://0.0.0.0:${PORT}`));
