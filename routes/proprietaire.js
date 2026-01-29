// routes/proprietaire.js - Routes pour l'espace propriétaire (PostgreSQL/Neon)

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

// Middleware pour vérifier que l'utilisateur est un propriétaire
const isProprietaire = (req, res, next) => {
  if (req.user.role !== 'proprietaire') {
    return res.status(403).json({ error: 'Accès refusé - Propriétaire uniquement' });
  }
  
  // Vérifier que proprietaire_id existe
  if (!req.user.proprietaire_id) {
    return res.status(400).json({ 
      error: 'ID propriétaire manquant. Votre compte n\'est pas correctement configuré.' 
    });
  }
  
  next();
};

// Préfixes pour numéros de bien
const PREFIX_MAP = {
  chambre: 'CHB',
  appartement: 'APT',
  maison: 'MSN',
  studio: 'STD',
  villa: 'VIL',
  bureau: 'BUR',
  commerce: 'COM'
};

// Fonction pour générer le numéro de bien
async function genererNumeroBien(type) {
  const prefix = PREFIX_MAP[type];
  if (!prefix) throw new Error('Type de bien invalide');

  const result = await pool.query(
    'SELECT numero_bien FROM biens WHERE type = $1 ORDER BY id DESC LIMIT 1',
    [type]
  );

  let nextNumber = 1;
  if (result.rows.length > 0) {
    const lastNumber = parseInt(result.rows[0].numero_bien.replace(prefix, ''));
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}

// GET /api/proprietaire/mes-biens - Récupérer tous les biens du propriétaire
router.get('/mes-biens', authenticate, isProprietaire, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, p.nom as proprietaire_nom, p.telephone as proprietaire_telephone
       FROM biens b
       LEFT JOIN proprietaires p ON b.proprietaire_id = p.id
       WHERE b.proprietaire_id = $1
       ORDER BY b.id DESC`,
      [req.user.proprietaire_id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur récupération biens proprietaire:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/proprietaire/mes-biens - Créer un nouveau bien
router.post('/mes-biens', authenticate, isProprietaire, async (req, res) => {
  try {
    const { type, adresse, surface, nombre_pieces, description } = req.body;

    console.log('🔍 Données reçues:', { type, adresse, surface, nombre_pieces, description });
    console.log('🔍 User:', req.user);
    console.log('🔍 Proprietaire ID:', req.user.proprietaire_id);

    // Validation
    if (!type || !adresse || !surface || !nombre_pieces) {
      return res.status(400).json({ 
        error: 'Type, adresse, surface et nombre de pièces sont obligatoires' 
      });
    }

    // Validation du type
    const typesValides = ['chambre', 'appartement', 'maison', 'studio', 'villa', 'bureau', 'commerce'];
    if (!typesValides.includes(type)) {
      return res.status(400).json({ 
        error: 'Type de bien invalide',
        validTypes: typesValides
      });
    }

    // Validation des nombres
    if (isNaN(surface) || surface <= 0) {
      return res.status(400).json({ error: 'La surface doit être un nombre positif' });
    }
    if (isNaN(nombre_pieces) || nombre_pieces <= 0) {
      return res.status(400).json({ error: 'Le nombre de pièces doit être un nombre positif' });
    }

    // Vérifier que le propriétaire existe
    const proprietaireCheck = await pool.query(
      'SELECT id FROM proprietaires WHERE id = $1',
      [req.user.proprietaire_id]
    );

    if (proprietaireCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Propriétaire non trouvé. Veuillez contacter l\'administrateur.' 
      });
    }

    // Générer le numéro de bien
    const numero_bien = await genererNumeroBien(type);

    console.log('🔍 Création du bien avec numero:', numero_bien);

    // Créer le bien
    const result = await pool.query(
      `INSERT INTO biens (numero_bien, proprietaire_id, type, adresse, surface, nombre_pieces, description, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'disponible')
       RETURNING *`,
      [
        numero_bien, 
        req.user.proprietaire_id, 
        type, 
        adresse, 
        surface, 
        nombre_pieces, 
        description || null
      ]
    );

    console.log('✅ Bien créé:', result.rows[0]);

    res.status(201).json({
      success: true,
      bien: result.rows[0],
      message: 'Bien créé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur création bien proprietaire:', error);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// PUT /api/proprietaire/mes-biens/:id - Modifier un bien
router.put('/mes-biens/:id', authenticate, isProprietaire, async (req, res) => {
  try {
    const { id } = req.params;
    const { adresse, surface, nombre_pieces, description, statut } = req.body;

    // Vérifier que le bien appartient au propriétaire
    const checkResult = await pool.query(
      'SELECT id FROM biens WHERE id = $1 AND proprietaire_id = $2',
      [id, req.user.proprietaire_id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bien non trouvé ou accès refusé' });
    }

    // Mettre à jour le bien
    const result = await pool.query(
      `UPDATE biens 
       SET adresse = $1, surface = $2, nombre_pieces = $3, description = $4, statut = $5
       WHERE id = $6
       RETURNING *`,
      [adresse, surface, nombre_pieces, description || null, statut || 'disponible', id]
    );

    res.json({ 
      success: true,
      bien: result.rows[0],
      message: 'Bien modifié avec succès' 
    });
  } catch (error) {
    console.error('Erreur modification bien proprietaire:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/proprietaire/mes-biens/:id - Supprimer un bien
router.delete('/mes-biens/:id', authenticate, isProprietaire, async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que le bien appartient au propriétaire
    const result = await pool.query(
      'SELECT statut FROM biens WHERE id = $1 AND proprietaire_id = $2',
      [id, req.user.proprietaire_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bien non trouvé ou accès refusé' });
    }

    // Vérifier que le bien n'est pas loué
    if (result.rows[0].statut === 'loue') {
      return res.status(400).json({ 
        error: 'Impossible de supprimer un bien loué. Résiliez d\'abord le contrat.' 
      });
    }

    // Supprimer le bien
    await pool.query('DELETE FROM biens WHERE id = $1', [id]);

    res.json({ 
      success: true,
      message: 'Bien supprimé avec succès' 
    });
  } catch (error) {
    console.error('Erreur suppression bien proprietaire:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/proprietaire/mes-contrats - Récupérer tous les contrats du propriétaire
router.get('/mes-contrats', authenticate, isProprietaire, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, 
              l.nom as locataire_nom, 
              l.telephone as locataire_tel,
              b.adresse as bien_adresse,
              b.type as bien_type,
              p.nom as proprietaire_nom
       FROM contrats c
       JOIN biens b ON c.bien_id = b.id
       JOIN locataires l ON c.locataire_id = l.id
       JOIN proprietaires p ON b.proprietaire_id = p.id
       WHERE b.proprietaire_id = $1
       ORDER BY c.id DESC`,
      [req.user.proprietaire_id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur récupération contrats proprietaire:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/proprietaire/mes-paiements - Récupérer tous les paiements des biens du propriétaire
router.get('/mes-paiements', authenticate, isProprietaire, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, 
              c.montant_loyer,
              l.nom as locataire_nom,
              b.adresse as bien_adresse
       FROM paiements p
       JOIN contrats c ON p.contrat_id = c.id
       JOIN biens b ON c.bien_id = b.id
       JOIN locataires l ON c.locataire_id = l.id
       WHERE b.proprietaire_id = $1
       ORDER BY p.date_paiement DESC`,
      [req.user.proprietaire_id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur récupération paiements proprietaire:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/proprietaire/stats - Statistiques du propriétaire
router.get('/stats', authenticate, isProprietaire, async (req, res) => {
  try {
    // Nombre de biens
    const biensResult = await pool.query(
      'SELECT COUNT(*) as total_biens FROM biens WHERE proprietaire_id = $1',
      [req.user.proprietaire_id]
    );

    // Nombre de biens loués
    const louesResult = await pool.query(
      'SELECT COUNT(*) as biens_loues FROM biens WHERE proprietaire_id = $1 AND statut = $2',
      [req.user.proprietaire_id, 'loue']
    );

    // Nombre de contrats actifs
    const contratsResult = await pool.query(
      `SELECT COUNT(*) as contrats_actifs 
       FROM contrats c
       JOIN biens b ON c.bien_id = b.id
       WHERE b.proprietaire_id = $1 AND c.statut = $2`,
      [req.user.proprietaire_id, 'actif']
    );

    // Revenu mensuel total
    const revenuResult = await pool.query(
      `SELECT COALESCE(SUM(c.montant_loyer), 0) as revenu_mensuel
       FROM contrats c
       JOIN biens b ON c.bien_id = b.id
       WHERE b.proprietaire_id = $1 AND c.statut = $2`,
      [req.user.proprietaire_id, 'actif']
    );

    res.json({
      total_biens: Number(biensResult.rows[0].total_biens),
      biens_loues: Number(louesResult.rows[0].biens_loues),
      contrats_actifs: Number(contratsResult.rows[0].contrats_actifs),
      revenu_mensuel: Number(revenuResult.rows[0].revenu_mensuel)
    });
  } catch (error) {
    console.error('Erreur récupération stats proprietaire:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;