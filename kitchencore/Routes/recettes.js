'use strict';
/**
 * KitchenCore – routes/recettes.js
 * Tables : recettes, recette_ingredients, recette_etapes, unites
 * Montage : require('./routes/recettes')(app, db)
 */

module.exports = function(app, db) {

  // ══════════════════════════════════════════════════════════
  // SCHÉMA
  // ══════════════════════════════════════════════════════════
  db.exec(`
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
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      recette_id    INTEGER NOT NULL REFERENCES recettes(id) ON DELETE CASCADE,
      position      INTEGER DEFAULT 0,
      type          TEXT DEFAULT 'ingredient',
      -- type = 'ingredient' | 'sous_recette'
      nom           TEXT NOT NULL,
      qty           TEXT DEFAULT '',
      unite         TEXT DEFAULT '',
      sous_recette_id INTEGER REFERENCES recettes(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS recette_etapes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      recette_id INTEGER NOT NULL REFERENCES recettes(id) ON DELETE CASCADE,
      position   INTEGER DEFAULT 0,
      titre      TEXT DEFAULT '',
      texte      TEXT NOT NULL,
      timer      INTEGER DEFAULT 0
    );
  `);

  // Seed unités de base si table vide
  const nbUnites = db.prepare('SELECT COUNT(*) as n FROM unites').get().n;
  if (nbUnites === 0) {
    const insU = db.prepare('INSERT OR IGNORE INTO unites(label) VALUES(?)');
    ['g','kg','ml','cl','L','pièce','c.à.c','c.à.s','pincée','bouquet','sachet','tranche','gousse','brin','boîte','paquet']
      .forEach(u => insU.run(u));
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════

  /** Reconstitue un objet recette complet depuis la DB */
  function getRecette(id) {
    const r = db.prepare('SELECT * FROM recettes WHERE id=?').get(id);
    if (!r) return null;
    r.tags        = JSON.parse(r.tags || '[]');
    r.favori      = !!r.favori;
    r.ingredients = db.prepare(
      'SELECT * FROM recette_ingredients WHERE recette_id=? ORDER BY position'
    ).all(id);
    r.etapes      = db.prepare(
      'SELECT * FROM recette_etapes WHERE recette_id=? ORDER BY position'
    ).all(id);
    return r;
  }

  /** Résout récursivement les sous-recettes pour les courses (max 3 niveaux) */
  function expandIngredients(recetteId, portions, basePortions, depth = 0) {
    if (depth > 3) return [];
    const ingredients = db.prepare(
      'SELECT * FROM recette_ingredients WHERE recette_id=? ORDER BY position'
    ).all(recetteId);

    const result = [];
    const ratio  = portions / (basePortions || 1);

    for (const ing of ingredients) {
      if (ing.type === 'sous_recette' && ing.sous_recette_id) {
        const sub = db.prepare('SELECT * FROM recettes WHERE id=?').get(ing.sous_recette_id);
        if (sub) {
          const subPortions = ing.qty ? parseFloat(ing.qty) * ratio : sub.portions;
          const expanded = expandIngredients(ing.sous_recette_id, subPortions, sub.portions, depth + 1);
          result.push(...expanded);
          continue;
        }
      }
      // Ingrédient normal — on scale la quantité si numérique
      const scaledQty = ing.qty && !isNaN(parseFloat(ing.qty))
        ? String(Math.round(parseFloat(ing.qty) * ratio * 100) / 100)
        : ing.qty;
      result.push({ ...ing, qty: scaledQty, _recette_id: recetteId });
    }
    return result;
  }

  /** Sauvegarde ingrédients + étapes (remplace tout) */
  function saveIngredients(recetteId, ingredients) {
    db.prepare('DELETE FROM recette_ingredients WHERE recette_id=?').run(recetteId);
    const ins = db.prepare(`
      INSERT INTO recette_ingredients(recette_id,position,type,nom,qty,unite,sous_recette_id)
      VALUES(?,?,?,?,?,?,?)
    `);
    (ingredients || []).forEach((ing, i) => {
      ins.run(
        recetteId, i,
        ing.type || 'ingredient',
        ing.nom || '',
        ing.qty  || '',
        ing.unite || '',
        ing.sous_recette_id || null
      );
    });
  }

  function saveEtapes(recetteId, etapes) {
    db.prepare('DELETE FROM recette_etapes WHERE recette_id=?').run(recetteId);
    const ins = db.prepare(`
      INSERT INTO recette_etapes(recette_id,position,titre,texte,timer)
      VALUES(?,?,?,?,?)
    `);
    (etapes || []).forEach((e, i) => {
      ins.run(recetteId, i, e.titre || '', e.texte || '', e.timer || 0);
    });
  }

  // ══════════════════════════════════════════════════════════
  // UNITÉS
  // ══════════════════════════════════════════════════════════

  app.get('/api/unites', (_req, res) => {
    res.json(db.prepare('SELECT * FROM unites ORDER BY label').all());
  });

  app.post('/api/unites', (req, res) => {
    const { label } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'label requis' });
    try {
      const i = db.prepare('INSERT INTO unites(label) VALUES(?)').run(label.trim());
      res.status(201).json(db.prepare('SELECT * FROM unites WHERE id=?').get(i.lastInsertRowid));
    } catch(e) {
      res.status(409).json({ error: 'Unité déjà existante' });
    }
  });

  app.delete('/api/unites/:id', (req, res) => {
    db.prepare('DELETE FROM unites WHERE id=?').run(req.params.id);
    res.status(204).end();
  });

  // ══════════════════════════════════════════════════════════
  // RECETTES — CRUD
  // ══════════════════════════════════════════════════════════

  /** GET /api/recettes — liste légère (sans ingrédients/étapes) */
  app.get('/api/recettes', (req, res) => {
    const rows = db.prepare(`
      SELECT r.*,
        COUNT(DISTINCT ri.id) AS nb_ingredients,
        COUNT(DISTINCT re.id) AS nb_etapes
      FROM recettes r
      LEFT JOIN recette_ingredients ri ON ri.recette_id = r.id
      LEFT JOIN recette_etapes      re ON re.recette_id = r.id
      GROUP BY r.id
      ORDER BY r.updated_at DESC
    `).all();
    rows.forEach(r => { r.tags = JSON.parse(r.tags || '[]'); r.favori = !!r.favori; });
    res.json(rows);
  });

  /** GET /api/recettes/:id — détail complet */
  app.get('/api/recettes/:id', (req, res) => {
    const r = getRecette(req.params.id);
    if (!r) return res.status(404).json({ error: 'Recette introuvable' });
    res.json(r);
  });

  /** POST /api/recettes — créer */
  app.post('/api/recettes', (req, res) => {
    const { nom, emoji='🍽️', photo='', description='', portions=2,
            temps_prep=0, temps_cuisson=0, tags=[], favori=false,
            note=0, source='', ingredients=[], etapes=[] } = req.body;
    if (!nom?.trim()) return res.status(400).json({ error: 'nom requis' });

    const ins = db.prepare(`
      INSERT INTO recettes(nom,emoji,photo,description,portions,temps_prep,temps_cuisson,tags,favori,note,source)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `);
    const info = ins.run(
      nom.trim(), emoji, photo, description,
      portions, temps_prep, temps_cuisson,
      JSON.stringify(tags), favori?1:0, note, source
    );
    saveIngredients(info.lastInsertRowid, ingredients);
    saveEtapes(info.lastInsertRowid, etapes);
    res.status(201).json(getRecette(info.lastInsertRowid));
  });

  /** PATCH /api/recettes/:id — modifier */
  app.patch('/api/recettes/:id', (req, res) => {
    const id = req.params.id;
    if (!db.prepare('SELECT id FROM recettes WHERE id=?').get(id)) {
      return res.status(404).json({ error: 'Recette introuvable' });
    }
    const fields = ['nom','emoji','photo','description','portions','temps_prep',
                    'temps_cuisson','favori','note','source'];
    const sets = [], vals = [];
    fields.forEach(k => {
      if (req.body[k] !== undefined) {
        sets.push(k + '=?');
        vals.push(k === 'favori' ? (req.body[k]?1:0) : req.body[k]);
      }
    });
    if (req.body.tags !== undefined) {
      sets.push('tags=?');
      vals.push(JSON.stringify(req.body.tags));
    }
    sets.push("updated_at=datetime('now')");
    if (sets.length > 1) {
      vals.push(id);
      db.prepare(`UPDATE recettes SET ${sets.join(',')} WHERE id=?`).run(...vals);
    }
    if (req.body.ingredients !== undefined) saveIngredients(id, req.body.ingredients);
    if (req.body.etapes      !== undefined) saveEtapes(id, req.body.etapes);
    res.json(getRecette(id));
  });

  /** DELETE /api/recettes/:id */
  app.delete('/api/recettes/:id', (req, res) => {
    const id = req.params.id;
    // Vérifier si cette recette est utilisée comme sous-recette ailleurs
    const used = db.prepare(
      'SELECT COUNT(*) as n FROM recette_ingredients WHERE sous_recette_id=?'
    ).get(id).n;
    if (used > 0) {
      return res.status(409).json({
        error: `Cette recette est utilisée comme sous-recette dans ${used} autre(s) recette(s).`
      });
    }
    db.prepare('DELETE FROM recettes WHERE id=?').run(id);
    res.status(204).end();
  });

  // ══════════════════════════════════════════════════════════
  // FAVORIS / NOTE (raccourcis pratiques)
  // ══════════════════════════════════════════════════════════

  app.post('/api/recettes/:id/favori', (req, res) => {
    const r = db.prepare('SELECT * FROM recettes WHERE id=?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Introuvable' });
    const newVal = r.favori ? 0 : 1;
    db.prepare("UPDATE recettes SET favori=?, updated_at=datetime('now') WHERE id=?").run(newVal, req.params.id);
    res.json({ favori: !!newVal });
  });

  app.post('/api/recettes/:id/note', (req, res) => {
    const { note } = req.body;
    if (note === undefined || note < 0 || note > 5) {
      return res.status(400).json({ error: 'note entre 0 et 5' });
    }
    db.prepare("UPDATE recettes SET note=?, updated_at=datetime('now') WHERE id=?").run(note, req.params.id);
    res.json({ note });
  });

  // ══════════════════════════════════════════════════════════
  // COURSES — ingrédients expandés (sous-recettes dépliées)
  // ══════════════════════════════════════════════════════════

  app.get('/api/recettes/:id/courses', (req, res) => {
    const r = db.prepare('SELECT * FROM recettes WHERE id=?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Introuvable' });
    const portions = parseInt(req.query.portions) || r.portions;
    const ingredients = expandIngredients(r.id, portions, r.portions);
    res.json({ recette_id: r.id, nom: r.nom, portions, ingredients });
  });

  // ══════════════════════════════════════════════════════════
  // IMPORT MEALIE
  // ══════════════════════════════════════════════════════════

  /**
   * POST /api/recettes/import/mealie
   * Body: { mealie_url: "http://192.168.1.123:30111", recipe_slug: "poulet-basquaise" }
   * OU  { mealie_url: "...", api_token: "...", recipe_slug: "..." }
   *
   * Sans token = utilise l'API publique de Mealie (lecture seule sur recettes publiques)
   */
  app.post('/api/recettes/import/mealie', async (req, res) => {
    const { mealie_url, recipe_slug, api_token } = req.body;
    if (!mealie_url || !recipe_slug) {
      return res.status(400).json({ error: 'mealie_url et recipe_slug requis' });
    }

    try {
      const base    = mealie_url.replace(/\/$/, '');
      const headers = { 'Content-Type': 'application/json' };
      if (api_token) headers['Authorization'] = `Bearer ${api_token}`;

      // 1. Récupérer la recette depuis Mealie
      const mRes = await fetch(`${base}/api/recipes/${recipe_slug}`, { headers });
      if (!mRes.ok) {
        const err = await mRes.text();
        return res.status(mRes.status).json({ error: `Mealie: ${err}` });
      }
      const m = await mRes.json();

      // 2. Mapper le format Mealie → KitchenCore
      const tags = [
        ...(m.tags  || []).map(t => t.name?.toLowerCase()).filter(Boolean),
        ...(m.categories || []).map(c => c.name?.toLowerCase()).filter(Boolean),
      ].slice(0, 5);

      const ingredients = (m.recipeIngredient || []).map((ing, i) => ({
        position: i,
        type:     'ingredient',
        nom:      [ing.food?.name, ing.note].filter(Boolean).join(' ') || ing.display || '',
        qty:      ing.quantity != null ? String(ing.quantity) : '',
        unite:    ing.unit?.name || '',
        sous_recette_id: null,
      }));

      const etapes = (m.recipeInstructions || []).map((step, i) => ({
        position: i,
        titre:    step.title || '',
        texte:    step.text  || '',
        timer:    0,
      }));

      // Calcul temps en minutes (Mealie stocke en ISO 8601 duration ou minutes)
      const parseDuration = (d) => {
        if (!d) return 0;
        if (typeof d === 'number') return d;
        const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        if (!m) return 0;
        return (parseInt(m[1]||0)*60) + parseInt(m[2]||0);
      };

      const recette = {
        nom:           m.name             || 'Recette importée',
        emoji:         '🍽️',
        photo:         m.image ? `${base}${m.image}` : '',
        description:   m.description      || '',
        portions:      m.recipeYield ? parseInt(m.recipeYield) || 2 : 2,
        temps_prep:    parseDuration(m.prepTime),
        temps_cuisson: parseDuration(m.performTime || m.cookTime),
        tags,
        favori:        false,
        note:          m.rating ? Math.round(parseFloat(m.rating)) : 0,
        source:        m.orgURL || `${base}/g/home/r/${recipe_slug}`,
        ingredients,
        etapes,
      };

      // 3. Vérifier doublon (même nom)
      const existing = db.prepare('SELECT id FROM recettes WHERE nom=?').get(recette.nom);
      if (existing) {
        return res.status(409).json({
          error: `Une recette nommée "${recette.nom}" existe déjà.`,
          existing_id: existing.id
        });
      }

      // 4. Insérer
      const ins = db.prepare(`
        INSERT INTO recettes(nom,emoji,photo,description,portions,temps_prep,temps_cuisson,tags,favori,note,source)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)
      `);
      const info = ins.run(
        recette.nom, recette.emoji, recette.photo, recette.description,
        recette.portions, recette.temps_prep, recette.temps_cuisson,
        JSON.stringify(recette.tags), 0, recette.note, recette.source
      );
      saveIngredients(info.lastInsertRowid, recette.ingredients);
      saveEtapes(info.lastInsertRowid, recette.etapes);

      res.status(201).json({
        message: `"${recette.nom}" importée avec succès`,
        recette: getRecette(info.lastInsertRowid)
      });

    } catch(e) {
      console.error('[import/mealie]', e);
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/recettes/import/mealie/search
   * ?url=http://192.168.1.123:30111&q=poulet&token=xxx
   * → liste les recettes Mealie filtrables pour l'UI de sélection
   */
  app.get('/api/recettes/import/mealie/search', async (req, res) => {
    const { url: mealie_url, q = '', token } = req.query;
    if (!mealie_url) return res.status(400).json({ error: 'url requis' });

    try {
      const base    = mealie_url.replace(/\/$/, '');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const search = q ? `&search=${encodeURIComponent(q)}` : '';
      const mRes   = await fetch(`${base}/api/recipes?page=1&perPage=50${search}`, { headers });
      if (!mRes.ok) return res.status(mRes.status).json({ error: 'Mealie inaccessible' });

      const data = await mRes.json();
      const items = (data.items || []).map(r => ({
        slug:        r.slug,
        nom:         r.name,
        description: r.description || '',
        photo:       r.image ? `${base}${r.image}` : '',
        portions:    r.recipeYield ? parseInt(r.recipeYield) || 2 : 2,
      }));
      res.json({ total: data.total || items.length, items });

    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

};
