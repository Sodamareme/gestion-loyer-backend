const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const PREFIX_MAP = {
  chambre: 'CHB',
  appartement: 'APT',
  maison: 'MSN',
  studio: 'STD',
  villa: 'VIL',
  bureau: 'BUR',
  commerce: 'COM'
};

// Configuration Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/biens';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'bien-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Seules les images (JPEG, JPG, PNG, WEBP) sont autorisées'));
  }
}).array('photos', 5);

exports.uploadPhotos = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'La taille du fichier ne doit pas dépasser 5MB' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Maximum 5 photos autorisées' });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

async function genererNumeroBien(type) {
  const prefix = PREFIX_MAP[type];
  if (!prefix) {
    throw new Error('Type de bien invalide');
  }

  const { rows } = await pool.query(
    `SELECT numero_bien FROM biens WHERE type = $1 ORDER BY id DESC LIMIT 1`,
    [type]
  );

  let nextNumber = 1;
  if (rows.length > 0) {
    const lastNumero = rows[0].numero_bien;
    const lastNumber = parseInt(lastNumero.replace(prefix, ''));
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}

// =================================================== 
// 🔹 LISTE DES BIENS
// =================================================== 
exports.getBiens = async (req, res) => {
  try {
    const { agence_id } = req.query;
    
    let query = `
      SELECT b.*, 
             p.nom AS proprietaire_nom, 
             p.telephone AS proprietaire_telephone,
             a.nom AS agence_nom,
             a.code AS agence_code
      FROM biens b
      LEFT JOIN proprietaires p ON b.proprietaire_id = p.id
      LEFT JOIN agences a ON b.agence_id = a.id
    `;
    
    const params = [];
    if (agence_id) {
      query += ` WHERE b.agence_id = $1`;
      params.push(agence_id);
    }
    
    query += ` ORDER BY b.id DESC`;

    const { rows } = await pool.query(query, params);

    const biensWithPhotos = rows.map(bien => ({
      ...bien,
      photos: bien.photos ? (typeof bien.photos === 'string' ? JSON.parse(bien.photos) : bien.photos) : []
    }));

    res.json(biensWithPhotos);
  } catch (error) {
    console.error('❌ Erreur récupération biens:', error);
    res.status(500).json({ error: error.message });
  }
};
exports.get= async (req, res) => {
  try {
    let query = `
      SELECT 
        b.*,
        p.nom as proprietaire_nom,
        p.telephone as proprietaire_telephone,
        a.nom as agence_nom,
        a.code as agence_code
      FROM biens b
      LEFT JOIN proprietaires p ON b.proprietaire_id = p.id
      LEFT JOIN agences a ON b.agence_id = a.id
      WHERE b.statut = 'disponible'
    `;
    
    const params = [];
    
    // ✅ DÉTECTION AUTOMATIQUE: Si l'utilisateur est une agence, filtrer automatiquement
    if (req.user.role === 'agence' && req.user.agence_id) {
      query += ' AND b.agence_id = $1';
      params.push(req.user.agence_id);
      console.log('🏢 Agence détectée - Filtrage automatique sur agence_id:', req.user.agence_id);
    }
    // ✅ Si un agence_id est passé en query param (pour admin), l'utiliser
    else if (req.query.agence_id) {
      query += ' AND b.agence_id = $1';
      params.push(req.query.agence_id);
      console.log('👤 Admin - Filtrage sur agence_id:', req.query.agence_id);
    }
    
    query += ' ORDER BY b.created_at DESC';
    
    const { rows } = await pool.query(query, params);
    
    console.log('✅ Biens disponibles:', rows.length);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération biens disponibles:', error);
    res.status(500).json({ error: error.message });
  }
},

// ✅ GET /api/biens - Tous les biens

// =================================================== 
// 🔹 BIENS DISPONIBLES - ROUTE PUBLIQUE
// =================================================== 
exports.getBiensDisponibles = async (req, res) => {
  try {
    const { agence_id } = req.query;
    
    console.log('🏠 Récupération biens disponibles, agence_id:', agence_id);
    
    // ✅ CORRECTION: Utilisation de || avec COALESCE
    let query = `
      SELECT b.*, 
             p.nom || ' ' || COALESCE(p.prenom, '') as proprietaire_nom,
             a.nom AS agence_nom,
             a.code AS agence_code
      FROM biens b
      LEFT JOIN proprietaires p ON b.proprietaire_id = p.id
      LEFT JOIN agences a ON b.agence_id = a.id
      WHERE b.statut = 'disponible'
    `;
    
    const params = [];
    if (agence_id) {
      query += ` AND b.agence_id = $1`;
      params.push(agence_id);
    }
    
    query += ` ORDER BY b.id DESC`;

    console.log('📝 Query SQL:', query);
    console.log('📝 Params:', params);

    const { rows } = await pool.query(query, params);
    
    console.log('✅ Biens trouvés:', rows.length);

    const biensWithPhotos = rows.map(bien => ({
      ...bien,
      photos: bien.photos ? (typeof bien.photos === 'string' ? JSON.parse(bien.photos) : bien.photos) : []
    }));

    res.json(biensWithPhotos);
  } catch (error) {
    console.error('❌ Erreur récupération biens disponibles:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// =================================================== 
// 🔹 CRÉER UN BIEN
// =================================================== 
exports.createBien = async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('🏠 === CRÉATION NOUVEAU BIEN ===');
    
    const { proprietaire_id, agence_id, adresse, type, surface, nombre_pieces, description } = req.body;

    if (!proprietaire_id || !adresse || !type || !surface || !nombre_pieces) {
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => fs.unlinkSync(file.path));
      }
      return res.status(400).json({ 
        error: 'Tous les champs obligatoires doivent être remplis',
        required: ['proprietaire_id', 'adresse', 'type', 'surface', 'nombre_pieces']
      });
    }

    const typesValides = ['chambre', 'appartement', 'maison', 'studio', 'villa', 'bureau', 'commerce'];
    if (!typesValides.includes(type)) {
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => fs.unlinkSync(file.path));
      }
      return res.status(400).json({ 
        error: 'Type de bien invalide',
        validTypes: typesValides 
      });
    }

    if (isNaN(surface) || surface <= 0) {
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => fs.unlinkSync(file.path));
      }
      return res.status(400).json({ error: 'La surface doit être un nombre positif' });
    }

    if (isNaN(nombre_pieces) || nombre_pieces <= 0) {
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => fs.unlinkSync(file.path));
      }
      return res.status(400).json({ error: 'Le nombre de pièces doit être un nombre positif' });
    }

    await client.query('BEGIN');

    const { rows: proprietaire } = await client.query(
      'SELECT id FROM proprietaires WHERE id = $1',
      [proprietaire_id]
    );
    
    if (proprietaire.length === 0) {
      await client.query('ROLLBACK');
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => fs.unlinkSync(file.path));
      }
      return res.status(404).json({ error: 'Propriétaire introuvable' });
    }

    if (agence_id && agence_id !== 'null' && agence_id !== '') {
      const { rows: agence } = await client.query(
        'SELECT id FROM agences WHERE id = $1 AND actif = true',
        [agence_id]
      );
      
      if (agence.length === 0) {
        await client.query('ROLLBACK');
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => fs.unlinkSync(file.path));
        }
        return res.status(404).json({ error: 'Agence introuvable ou inactive' });
      }
    }

    const numero_bien = await genererNumeroBien(type);
    const photos = req.files ? req.files.map(file => file.path) : [];

    const { rows: result } = await client.query(
      `INSERT INTO biens 
       (numero_bien, proprietaire_id, agence_id, adresse, type, surface, nombre_pieces, description, statut, photos) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'disponible', $9) 
       RETURNING id`,
      [
        numero_bien,
        proprietaire_id,
        agence_id && agence_id !== 'null' && agence_id !== '' ? agence_id : null,
        adresse,
        type,
        surface,
        nombre_pieces,
        description || null,
        JSON.stringify(photos)
      ]
    );

    await client.query('COMMIT');

    console.log('✅ Bien créé avec succès, ID:', result[0].id);

    res.status(201).json({
      id: result[0].id,
      numero_bien,
      photos: photos,
      message: 'Bien créé avec succès'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur création bien:', error);
    
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({ 
      error: 'Erreur serveur lors de la création du bien',
      details: error.message 
    });
  } finally {
    client.release();
  }
};

// =================================================== 
// 🔹 MODIFIER UN BIEN
// =================================================== 
exports.updateBien = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { adresse, surface, nombre_pieces, description, statut, agence_id } = req.body;

    const statutsValides = ['disponible', 'loue', 'maintenance'];
    if (statut && !statutsValides.includes(statut)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Statut invalide. Valeurs acceptées: disponible, loue, maintenance' 
      });
    }

    const { rows: existing } = await client.query(
      'SELECT * FROM biens WHERE id = $1',
      [id]
    );

    if (existing.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bien introuvable' });
    }

    if (agence_id !== undefined && agence_id !== null && agence_id !== '' && agence_id !== 'null') {
      const { rows: agence } = await client.query(
        'SELECT id FROM agences WHERE id = $1 AND actif = true',
        [agence_id]
      );
      
      if (agence.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Agence introuvable ou inactive' });
      }
    }

    const oldPhotos = existing[0].photos ? JSON.parse(existing[0].photos) : [];
    const newPhotos = req.files ? req.files.map(file => file.path) : [];
    const allPhotos = [...oldPhotos, ...newPhotos];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (adresse !== undefined) {
      updates.push(`adresse = $${paramIndex++}`);
      values.push(adresse);
    }
    if (surface !== undefined) {
      updates.push(`surface = $${paramIndex++}`);
      values.push(surface);
    }
    if (nombre_pieces !== undefined) {
      updates.push(`nombre_pieces = $${paramIndex++}`);
      values.push(nombre_pieces);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (statut !== undefined) {
      updates.push(`statut = $${paramIndex++}`);
      values.push(statut);
    }
    if (agence_id !== undefined) {
      updates.push(`agence_id = $${paramIndex++}`);
      values.push((agence_id === '' || agence_id === 'null') ? null : agence_id);
    }
    if (newPhotos.length > 0) {
      updates.push(`photos = $${paramIndex++}`);
      values.push(JSON.stringify(allPhotos));
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Aucun champ à modifier' });
    }

    values.push(id);

    await client.query(
      `UPDATE biens SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    await client.query('COMMIT');

    res.json({
      message: 'Bien modifié avec succès',
      photos: allPhotos
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur modification bien:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// =================================================== 
// 🔹 SUPPRIMER UNE PHOTO
// =================================================== 
exports.deletePhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const { photoPath } = req.body;

    const { rows } = await pool.query(
      'SELECT photos FROM biens WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Bien introuvable' });
    }

    const photos = rows[0].photos ? JSON.parse(rows[0].photos) : [];
    const updatedPhotos = photos.filter(p => p !== photoPath);

    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }

    await pool.query(
      'UPDATE biens SET photos = $1 WHERE id = $2',
      [JSON.stringify(updatedPhotos), id]
    );

    res.json({
      message: 'Photo supprimée avec succès',
      photos: updatedPhotos
    });

  } catch (error) {
    console.error('❌ Erreur suppression photo:', error);
    res.status(500).json({ error: error.message });
  }
};

// =================================================== 
// 🔹 SUPPRIMER UN BIEN
// =================================================== 
exports.deleteBien = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    const { rows } = await client.query(
      `SELECT statut, photos FROM biens WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Bien introuvable' });
    }

    if (rows[0].statut === 'loue') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Impossible de supprimer un bien loué' });
    }

    const photos = rows[0].photos ? JSON.parse(rows[0].photos) : [];
    photos.forEach(photoPath => {
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    });

    await client.query(`DELETE FROM biens WHERE id = $1`, [id]);

    await client.query('COMMIT');

    res.json({ message: 'Bien supprimé avec succès' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur suppression bien:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// =================================================== 
// 🔹 STATISTIQUES PAR AGENCE
// =================================================== 
exports.getStatsByAgence = async (req, res) => {
  try {
    const { agence_id } = req.params;

    const { rows } = await pool.query(
      `SELECT 
         COUNT(*) as total_biens,
         COUNT(CASE WHEN statut = 'disponible' THEN 1 END) as biens_disponibles,
         COUNT(CASE WHEN statut = 'loue' THEN 1 END) as biens_loues,
         COUNT(CASE WHEN statut = 'maintenance' THEN 1 END) as biens_maintenance,
         COALESCE(SUM(surface), 0) as surface_totale,
         COALESCE(AVG(surface), 0) as surface_moyenne
       FROM biens 
       WHERE agence_id = $1`,
      [agence_id]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error('❌ Erreur statistiques biens:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = exports;