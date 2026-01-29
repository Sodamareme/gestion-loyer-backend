// agences.js - CORRECTION : Tous les locataires validés, mais seulement les biens de l'agence
const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');


// Configuration upload pour logo
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/logos/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `logo-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Seuls les fichiers JPEG, JPG et PNG sont acceptés'));
  }
});

// Fonction pour générer un code unique d'agence
const generateAgenceCode = async () => {
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM agences');
  const number = String(parseInt(rows[0].count) + 1).padStart(3, '0');
  return `AG-${number}`;
};

// ============================================
// ⚠️ IMPORTANT: Routes spécifiques AVANT les routes avec :id
// ============================================

// ✅ GET - Agences actives (route spécifique)
router.get('/actives', async (req, res) => {
  try {
    const { rows: agences } = await pool.query(
      'SELECT * FROM agences WHERE actif = true ORDER BY nom'
    );
    
    console.log('✅ Agences actives récupérées:', agences.length);
    res.json(agences);
  } catch (error) {
    console.error('Erreur récupération agences actives:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ NOTE: Route /locataires SUPPRIMÉE
// L'agence utilise maintenant l'API existante: GET /api/locataires
// Qui est gérée par locataireRoutes.js et retourne TOUS les locataires validés

// ✅ GET - Propriétaires de l'agence (route spécifique)
router.get('/proprietaires', authenticateToken, requireRole(['agence']), async (req, res) => {
  try {
    const agence_id = req.user.agence_id;
    
    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    console.log('📋 Récupération propriétaires pour agence:', agence_id);

    // Récupérer TOUS les propriétaires liés à cette agence
    const { rows } = await pool.query(`
      SELECT DISTINCT
        p.id,
        p.nom,
        p.prenom,
        p.telephone,
        p.email,
        p.adresse,
        p.statut_validation,
        p.agence_id,
        COUNT(DISTINCT b.id) as nombre_biens
      FROM proprietaires p
      LEFT JOIN biens b ON b.proprietaire_id = p.id AND b.agence_id = $1
      WHERE (p.agence_id = $1 OR b.agence_id = $1)
        AND p.statut_validation = 'valide'
      GROUP BY p.id, p.nom, p.prenom, p.telephone, p.email, p.adresse, p.statut_validation, p.agence_id
      ORDER BY p.nom
    `, [agence_id]);

    console.log('✅ Propriétaires trouvés:', rows.length);

    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération propriétaires agence:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ POST - Créer un propriétaire pour l'agence
router.post('/proprietaires', authenticateToken, requireRole(['agence']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const agence_id = req.user.agence_id;
    
    if (!agence_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    const { nom, prenom, telephone, email, adresse } = req.body;

    console.log('🆕 Création propriétaire par agence:', agence_id);
    console.log('Données:', { nom, prenom, telephone, email });

    // Validation
    if (!nom || !telephone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Nom et téléphone obligatoires' });
    }

    // Vérifier si un propriétaire avec ce téléphone existe déjà
    const { rows: existingRows } = await client.query(
      'SELECT id FROM proprietaires WHERE telephone = $1',
      [telephone]
    );

    if (existingRows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Un propriétaire avec ce numéro de téléphone existe déjà' 
      });
    }

    // Vérifier si l'email existe déjà
    if (email) {
      const { rows: emailRows } = await client.query(
        'SELECT id FROM proprietaires WHERE email = $1',
        [email]
      );

      if (emailRows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Un propriétaire avec cet email existe déjà' 
        });
      }
    }

    // Créer le propriétaire avec statut validé automatiquement
    const { rows: proprietaireRows } = await client.query(
      `INSERT INTO proprietaires 
       (nom, prenom, telephone, email, adresse, statut_validation, date_validation, agence_id) 
       VALUES ($1, $2, $3, $4, $5, 'valide', NOW(), $6)
       RETURNING id`,
      [nom, prenom, telephone, email, adresse, agence_id]
    );

    const proprietaire_id = proprietaireRows[0].id;

    await client.query('COMMIT');

    console.log('✅ Propriétaire créé avec ID:', proprietaire_id);

    res.status(201).json({
      id: proprietaire_id,
      message: 'Propriétaire créé avec succès',
      info: 'Le propriétaire a été créé et associé à votre agence'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur création propriétaire par agence:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});
router.post('/', upload.single('logo'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const {
      nom,
      adresse,
      telephone,
      email,
      ville,
      pays,
      responsable_nom,
      responsable_telephone,
      responsable_email,
      description
    } = req.body;

    console.log('🏢 === CRÉATION NOUVELLE AGENCE ===');
    console.log('Nom:', nom);
    console.log('Email:', email);
    console.log('Téléphone:', telephone);

    // Validation
    if (!nom) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Le nom de l\'agence est obligatoire' });
    }

    if (!email) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'L\'email est obligatoire pour créer le compte de connexion' });
    }

    if (!telephone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Le téléphone est obligatoire (utilisé comme mot de passe)' });
    }

    // Vérifier si l'email est déjà utilisé
    const { rows: emailCheck } = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (emailCheck.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cet email est déjà utilisé par un autre compte' });
    }

    // Générer un code unique
    const code = await generateAgenceCode();
    const logo = req.file ? req.file.filename : null;

    console.log('✅ Code généré:', code);

    // Créer l'agence avec actif = true par défaut
    const { rows: agenceResult } = await client.query(
      `INSERT INTO agences 
       (nom, code, adresse, telephone, email, ville, pays, responsable_nom, responsable_telephone, responsable_email, logo, description, actif) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
       RETURNING id`,
      [nom, code, adresse, telephone, email, ville, pays || 'Sénégal', responsable_nom, responsable_telephone, responsable_email, logo, description]
    );

    const agence_id = agenceResult[0].id;
    console.log('✅ Agence créée avec ID:', agence_id);

    // Créer automatiquement le compte utilisateur
    console.log('🔐 Création automatique du compte utilisateur...');

    const hashedPassword = await bcrypt.hash(telephone, 10);

    const { rows: userResult } = await client.query(
      `INSERT INTO users (email, password, role, agence_id, is_active) 
       VALUES ($1, $2, 'agence', $3, true)
       RETURNING id`,
      [email, hashedPassword, agence_id]
    );

    const user_id = userResult[0].id;
    console.log('✅ Compte utilisateur créé avec ID:', user_id);

    await client.query('COMMIT');

    const { rows: nouvelleAgence } = await client.query(
      'SELECT * FROM agences WHERE id = $1',
      [agence_id]
    );

    console.log('✅ === AGENCE ET COMPTE CRÉÉS AVEC SUCCÈS ===');

    res.status(201).json({
      success: true,
      agence: nouvelleAgence[0],
      user: {
        id: user_id,
        email: email,
        role: 'agence',
        agence_id: agence_id
      },
      credentials: {
        email: email,
        password: telephone,
        message: '⚠️ IMPORTANT: Communiquez ces identifiants à l\'agence. Le mot de passe est le numéro de téléphone.'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur création agence:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la création de l\'agence',
      details: error.message 
    });
  } finally {
    client.release();
  }
});
// ✅ PUT - Modifier un propriétaire de l'agence


// ============================================
// Routes génériques avec :id (À LA FIN)
// ============================================

// ✅ GET - Liste de toutes les agences (admin only)
router.get('/', async (req, res) => {
  try {
    const { rows: agences } = await pool.query(
      `SELECT 
        a.*,
        COUNT(DISTINCT p.id) as nombre_proprietaires,
        COUNT(DISTINCT l.id) as nombre_locataires,
        COUNT(DISTINCT b.id) as nombre_biens,
        COUNT(DISTINCT c.id) as nombre_contrats
       FROM agences a
       LEFT JOIN proprietaires p ON p.agence_id = a.id
       LEFT JOIN locataires l ON l.agence_id = a.id
       LEFT JOIN biens b ON b.agence_id = a.id
       LEFT JOIN contrats c ON c.agence_id = a.id
       GROUP BY a.id
       ORDER BY a.date_creation DESC`
    );
    
    res.json(agences);
  } catch (error) {
    console.error('Erreur récupération agences:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ GET - Une agence par ID
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        a.*,
        COUNT(DISTINCT p.id) as nombre_proprietaires,
        COUNT(DISTINCT l.id) as nombre_locataires,
        COUNT(DISTINCT b.id) as nombre_biens,
        COUNT(DISTINCT c.id) as nombre_contrats
       FROM agences a
       LEFT JOIN proprietaires p ON p.agence_id = a.id
       LEFT JOIN locataires l ON l.agence_id = a.id
       LEFT JOIN biens b ON b.agence_id = a.id
       LEFT JOIN contrats c ON c.agence_id = a.id
       WHERE a.id = $1
       GROUP BY a.id`,
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Agence non trouvée' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Erreur récupération agence:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ GET - Statistiques d'une agence
router.get('/:id/statistiques', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        COUNT(DISTINCT p.id) as total_proprietaires,
        COUNT(DISTINCT l.id) as total_locataires,
        COUNT(DISTINCT b.id) as total_biens,
        COUNT(DISTINCT CASE WHEN b.statut = 'disponible' THEN b.id END) as biens_disponibles,
        COUNT(DISTINCT CASE WHEN b.statut = 'loue' THEN b.id END) as biens_loues,
        COUNT(DISTINCT c.id) as total_contrats,
        COUNT(DISTINCT CASE WHEN c.statut = 'actif' THEN c.id END) as contrats_actifs,
        COALESCE(SUM(CASE WHEN c.statut = 'actif' THEN c.montant_loyer ELSE 0 END), 0) as revenus_mensuels
       FROM agences a
       LEFT JOIN proprietaires p ON p.agence_id = a.id
       LEFT JOIN locataires l ON l.agence_id = a.id
       LEFT JOIN biens b ON b.agence_id = a.id
       LEFT JOIN contrats c ON c.agence_id = a.id
       WHERE a.id = $1`,
      [req.params.id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Erreur récupération statistiques agence:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ POST - Créer une nouvelle agence


// ✅ PUT - Modifier une agence
router.put('/:id', upload.single('logo'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const {
      nom,
      adresse,
      telephone,
      email,
      ville,
      pays,
      responsable_nom,
      responsable_telephone,
      responsable_email,
      description,
      actif
    } = req.body;

    console.log('🔄 === MODIFICATION AGENCE ===');
    console.log('ID:', req.params.id);

    const { rows: agenceRows } = await client.query(
      'SELECT * FROM agences WHERE id = $1',
      [req.params.id]
    );
    
    if (agenceRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Agence non trouvée' });
    }

    const agence = agenceRows[0];
    const logo = req.file ? req.file.filename : agence.logo;

    let actifValue = agence.actif;
    if (actif !== undefined) {
      actifValue = (actif === true || actif === 'true' || actif === 1 || actif === '1');
    }

    await client.query(
      `UPDATE agences SET 
       nom = $1, adresse = $2, telephone = $3, email = $4, ville = $5, pays = $6,
       responsable_nom = $7, responsable_telephone = $8, responsable_email = $9,
       logo = $10, description = $11, actif = $12
       WHERE id = $13`,
      [nom, adresse, telephone, email, ville, pays, responsable_nom, responsable_telephone, responsable_email, logo, description, actifValue, req.params.id]
    );

    const { rows: existingUserRows } = await client.query(
      'SELECT id, email FROM users WHERE agence_id = $1',
      [req.params.id]
    );

    if (existingUserRows.length > 0) {
      const existingUser = existingUserRows[0];

      if (email && telephone) {
        if (email !== existingUser.email) {
          const { rows: emailCheckRows } = await client.query(
            'SELECT id FROM users WHERE email = $1 AND id != $2',
            [email, existingUser.id]
          );

          if (emailCheckRows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cet email est déjà utilisé par un autre compte' });
          }
        }

        const hashedPassword = await bcrypt.hash(telephone, 10);

        await client.query(
          'UPDATE users SET email = $1, password = $2, is_active = $3 WHERE id = $4',
          [email, hashedPassword, actifValue, existingUser.id]
        );

        console.log('✅ Identifiants utilisateur mis à jour');
      } else {
        await client.query(
          'UPDATE users SET is_active = $1 WHERE id = $2',
          [actifValue, existingUser.id]
        );
      }
    } else if (email && telephone) {
      const hashedPassword = await bcrypt.hash(telephone, 10);
      await client.query(
        `INSERT INTO users (email, password, role, agence_id, is_active) 
         VALUES ($1, $2, 'agence', $3, $4)
         RETURNING id`,
        [email, hashedPassword, req.params.id, actifValue]
      );
    }

    await client.query('COMMIT');

    const { rows: agenceModifiee } = await client.query(
      'SELECT * FROM agences WHERE id = $1',
      [req.params.id]
    );

    console.log('✅ === MODIFICATION TERMINÉE ===');

    res.json({
      success: true,
      agence: agenceModifiee[0],
      message: 'Agence et compte utilisateur mis à jour avec succès'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur modification agence:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});
router.put('/proprietaires/:id', authenticateToken, requireRole(['agence']), async (req, res) => {
  try {
    const agence_id = req.user.agence_id;
    const proprietaire_id = req.params.id;
    
    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    const { nom, prenom, telephone, email, adresse } = req.body;

    console.log('📝 Modification propriétaire:', proprietaire_id, 'par agence:', agence_id);

    // Vérifier que ce propriétaire a des biens gérés par cette agence
    const { rows: checkRows } = await pool.query(
      `SELECT COUNT(*) as count 
       FROM biens 
       WHERE proprietaire_id = $1 AND agence_id = $2`,
      [proprietaire_id, agence_id]
    );

    if (parseInt(checkRows[0].count) === 0) {
      return res.status(403).json({ 
        error: 'Vous n\'avez pas l\'autorisation de modifier ce propriétaire' 
      });
    }

    // Vérifier si le téléphone est déjà utilisé
    if (telephone) {
      const { rows: phoneRows } = await pool.query(
        'SELECT id FROM proprietaires WHERE telephone = $1 AND id != $2',
        [telephone, proprietaire_id]
      );

      if (phoneRows.length > 0) {
        return res.status(400).json({ 
          error: 'Ce numéro de téléphone est déjà utilisé' 
        });
      }
    }

    // Vérifier si l'email est déjà utilisé
    if (email) {
      const { rows: emailRows } = await pool.query(
        'SELECT id FROM proprietaires WHERE email = $1 AND id != $2',
        [email, proprietaire_id]
      );

      if (emailRows.length > 0) {
        return res.status(400).json({ 
          error: 'Cet email est déjà utilisé' 
        });
      }
    }

    // Mettre à jour le propriétaire
    await pool.query(
      `UPDATE proprietaires 
       SET nom = $1, prenom = $2, telephone = $3, email = $4, adresse = $5
       WHERE id = $6`,
      [nom, prenom, telephone, email, adresse, proprietaire_id]
    );

    console.log('✅ Propriétaire modifié');

    res.json({ 
      message: 'Propriétaire modifié avec succès' 
    });

  } catch (error) {
    console.error('❌ Erreur modification propriétaire par agence:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ GET - Un propriétaire spécifique
router.get('/proprietaires/:id', authenticateToken, requireRole(['agence']), async (req, res) => {
  try {
    const agence_id = req.user.agence_id;
    const proprietaire_id = req.params.id;
    
    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT
        p.id,
        p.nom,
        p.prenom,
        p.telephone,
        p.email,
        p.adresse,
        p.statut_validation,
        COUNT(DISTINCT b.id) as nombre_biens
      FROM proprietaires p
      INNER JOIN biens b ON b.proprietaire_id = p.id
      WHERE p.id = $1 AND b.agence_id = $2
      GROUP BY p.id, p.nom, p.prenom, p.telephone, p.email, p.adresse, p.statut_validation`,
      [proprietaire_id, agence_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        error: 'Propriétaire non trouvé ou non associé à votre agence' 
      });
    }

    res.json(rows[0]);

  } catch (error) {
    console.error('❌ Erreur récupération propriétaire:', error);
    res.status(500).json({ error: error.message });
  }
});
// ✅ DELETE - Supprimer une agence
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('🗑️ === SUPPRESSION AGENCE ===');
    console.log('ID:', req.params.id);

    const { rows } = await client.query(
      `SELECT 
        COUNT(DISTINCT p.id) as proprietaires,
        COUNT(DISTINCT l.id) as locataires,
        COUNT(DISTINCT b.id) as biens,
        COUNT(DISTINCT c.id) as contrats
       FROM agences a
       LEFT JOIN proprietaires p ON p.agence_id = a.id
       LEFT JOIN locataires l ON l.agence_id = a.id
       LEFT JOIN biens b ON b.agence_id = a.id
       LEFT JOIN contrats c ON c.agence_id = a.id
       WHERE a.id = $1`,
      [req.params.id]
    );

    const counts = rows[0];

    if (counts.proprietaires > 0 || counts.locataires > 0 || counts.biens > 0 || counts.contrats > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Impossible de supprimer cette agence car elle contient des données',
        details: {
          proprietaires: parseInt(counts.proprietaires),
          locataires: parseInt(counts.locataires),
          biens: parseInt(counts.biens),
          contrats: parseInt(counts.contrats)
        }
      });
    }

    const { rowCount: deleteUserCount } = await client.query(
      'DELETE FROM users WHERE agence_id = $1',
      [req.params.id]
    );
    console.log('✅ Compte(s) utilisateur supprimé(s):', deleteUserCount);

    await client.query('DELETE FROM agences WHERE id = $1', [req.params.id]);
    console.log('✅ Agence supprimée');

    await client.query('COMMIT');

    console.log('✅ === SUPPRESSION TERMINÉE ===');

    res.json({ 
      success: true,
      message: 'Agence et compte utilisateur supprimés avec succès' 
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur suppression agence:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;