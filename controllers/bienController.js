const pool = require('../config/db');

const PREFIX_MAP = {
  chambre: 'CHB',
  appartement: 'APT',
  maison: 'MSN',
  studio: 'STD',
  villa: 'VIL',
  bureau: 'BUR',
  commerce: 'COM'
};

// 🔹 Génération du numéro de bien (UNIQUEMENT À LA CRÉATION)
async function genererNumeroBien(type) {
  const prefix = PREFIX_MAP[type];

  if (!prefix) {
    throw new Error('Type de bien invalide');
  }

  const [rows] = await pool.execute(
    `SELECT numero_bien 
     FROM biens 
     WHERE type = $1
     ORDER BY id DESC 
     LIMIT 1`,
    [type]
  );

  let nextNumber = 1;

  if (rows.length > 0) {
    const lastNumber = parseInt(rows[0].numero_bien.replace(prefix, ''));
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}

// ===================================================
// 🔹 CRÉER UN BIEN
// ===================================================
exports.createBien = async (req, res) => {
  try {
    const { proprietaire_id, adresse, type, surface, nombre_pieces, description } = req.body;

    // ✅ VALIDATION DES DONNÉES
    if (!proprietaire_id || !adresse || !type || !surface || !nombre_pieces) {
      return res.status(400).json({ 
        error: 'Tous les champs obligatoires doivent être remplis',
        required: ['proprietaire_id', 'adresse', 'type', 'surface', 'nombre_pieces']
      });
    }

    // ✅ Validation du type
    const typesValides = ['chambre', 'appartement', 'maison', 'studio', 'villa', 'bureau', 'commerce'];
    if (!typesValides.includes(type)) {
      return res.status(400).json({ 
        error: 'Type de bien invalide',
        validTypes: typesValides
      });
    }

    // ✅ Validation des nombres
    if (isNaN(surface) || surface <= 0) {
      return res.status(400).json({ error: 'La surface doit être un nombre positif' });
    }
    if (isNaN(nombre_pieces) || nombre_pieces <= 0) {
      return res.status(400).json({ error: 'Le nombre de pièces doit être un nombre positif' });
    }

    // ✅ Vérifier que le propriétaire existe
    const [proprietaire] = await pool.execute(
      'SELECT id FROM proprietaires WHERE id = $1',
      [proprietaire_id]
    );

    if (proprietaire.length === 0) {
      return res.status(404).json({ error: 'Propriétaire introuvable' });
    }

    const numero_bien = await genererNumeroBien(type);

    const [result] = await pool.execute(
      `INSERT INTO biens 
      (numero_bien, proprietaire_id, adresse, type, surface, nombre_pieces, description, statut)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'disponible')
      RETURNING id`,
      [
        numero_bien,
        proprietaire_id,
        adresse,
        type,
        surface,
        nombre_pieces,
        description || null
      ]
    );

    res.status(201).json({
      id: result[0].id,
      numero_bien,
      message: 'Bien créé avec succès'
    });

  } catch (error) {
    console.error('Erreur création bien:', error);
    res.status(500).json({ 
      error: 'Erreur serveur lors de la création du bien',
      details: error.message 
    });
  }
};

// ===================================================
// 🔹 LISTE DES BIENS
// ===================================================
exports.getBiens = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        b.*, 
        p.nom AS proprietaire_nom, 
        p.telephone AS proprietaire_telephone
      FROM biens b
      JOIN proprietaires p ON b.proprietaire_id = p.id
      ORDER BY b.numero_bien
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ===================================================
// 🔹 BIENS DISPONIBLES
// ===================================================
exports.getBiensDisponibles = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM biens WHERE statut = 'disponible'`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ===================================================
// 🔹 MODIFIER UN BIEN
// ===================================================
exports.updateBien = async (req, res) => {
  try {
    const { id } = req.params;
    const { adresse, surface, nombre_pieces, description, statut } = req.body;

    // Validation du statut
    const statutsValides = ['disponible', 'loue', 'maintenance'];
    if (statut && !statutsValides.includes(statut)) {
      return res.status(400).json({ 
        error: 'Statut invalide. Valeurs acceptées: disponible, loue, maintenance' 
      });
    }

    // Vérifier que le bien existe
    const [existing] = await pool.execute(
      'SELECT * FROM biens WHERE id = $1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Bien introuvable' });
    }

    // Construire la requête dynamiquement selon les champs fournis
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

    // Si aucun champ à mettre à jour
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucun champ à modifier' });
    }

    // Ajouter l'ID à la fin
    values.push(id);

    // Exécuter la mise à jour
    const [result] = await pool.execute(
      `UPDATE biens SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Bien introuvable' });
    }

    res.json({ message: 'Bien modifié avec succès' });

  } catch (error) {
    console.error('Erreur modification bien:', error);
    res.status(500).json({ error: error.message });
  }
};

// ===================================================
// 🔹 SUPPRIMER UN BIEN
// ===================================================
exports.deleteBien = async (req, res) => {
  try {
    const { id } = req.params;

    // ⚠️ Sécurité métier : ne pas supprimer si loué
    const [rows] = await pool.execute(
      `SELECT statut FROM biens WHERE id = $1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Bien introuvable' });
    }

    if (rows[0].statut === 'loue') {
      return res.status(400).json({
        message: 'Impossible de supprimer un bien loué'
      });
    }

    await pool.execute(
      `DELETE FROM biens WHERE id = $1`,
      [id]
    );

    res.json({ message: 'Bien supprimé avec succès' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};