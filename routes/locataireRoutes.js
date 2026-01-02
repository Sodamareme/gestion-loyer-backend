const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { authenticate, isLocataire, isAdmin } = require('../middleware/auth'); 
const pdfService = require('../services/pdfService');

// Configuration upload photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/photos/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Seules les images (JPEG, JPG, PNG) sont acceptées'));
  }
});

// Obtenir le contrat actif du locataire
router.get('/mon-contrat', authenticate, isLocataire, async (req, res) => {
  try {
    const [contrats] = await pool.execute(
      `SELECT c.*, b.adresse as bien_adresse, b.type as bien_type
       FROM contrats c
       JOIN biens b ON c.bien_id = b.id
       WHERE c.locataire_id = ? AND c.statut = 'actif'
       LIMIT 1`,
      [req.user.locataire_id]
    );

    if (!contrats.length) {
      return res.status(404).json({ error: 'Aucun contrat actif trouvé' });
    }

    res.json(contrats[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM locataires ORDER BY nom');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir un locataire par ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM locataires WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Locataire non trouvé' });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Créer un locataire + compte utilisateur
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    let { nom, telephone, email, type } = req.body;

    if (!nom || !telephone || !email) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ error: 'Nom, téléphone et email obligatoires' });
    }

    // Valeurs par défaut
    if (type === undefined) type = 'particulier';

    // 1. Créer le locataire
    const [resultLocataire] = await connection.execute(
      'INSERT INTO locataires (nom, telephone, email, type) VALUES (?, ?, ?, ?)',
      [nom, telephone, email, type]
    );

    const locataireId = resultLocataire.insertId;

    // 2. Créer automatiquement le compte utilisateur
    const defaultPassword = telephone.replace(/\s/g, ''); // Enlever les espaces
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    await connection.execute(
      'INSERT INTO users (email, password, role, locataire_id, is_active) VALUES (?, ?, ?, ?, ?)',
      [email, hashedPassword, 'locataire', locataireId, 1]
    );

    await connection.commit();

    res.status(201).json({ 
      id: locataireId, 
      message: 'Locataire créé avec succès',
      credentials: {
        email: email,
        password: defaultPassword,
        info: 'Mot de passe par défaut = numéro de téléphone (sans espaces)'
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Erreur création locataire:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      connection.release();
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }
    
    connection.release();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// Mettre à jour un locataire
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { nom, telephone, email, type } = req.body;
    const locataireId = req.params.id;
    
    // Récupérer l'ancien email
    const [[oldLocataire]] = await connection.execute(
      'SELECT email FROM locataires WHERE id = ?',
      [locataireId]
    );
    
    if (!oldLocataire) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Locataire non trouvé' });
    }

    // Mettre à jour le locataire
    await connection.execute(
      'UPDATE locataires SET nom = ?, telephone = ?, email = ?, type = ? WHERE id = ?',
      [nom, telephone, email, type, locataireId]
    );

    // Si l'email a changé, mettre à jour le compte utilisateur
    if (oldLocataire.email !== email) {
      await connection.execute(
        'UPDATE users SET email = ? WHERE locataire_id = ?',
        [email, locataireId]
      );
    }

    await connection.commit();
    res.json({ message: 'Locataire mis à jour' });

  } catch (error) {
    await connection.rollback();
    console.error(error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      connection.release();
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }
    
    connection.release();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// Soumettre relevé d'eau + paiement
router.post('/soumettre-paiement', 
  authenticate, 
  isLocataire, 
  upload.fields([
    { name: 'photo_eau', maxCount: 1 },
    { name: 'photo_paiement', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const {
        contrat_id,
        nouvel_index_eau,
        date_releve_eau,
        montant_paye,
        mode_paiement,
        mois_concerne
      } = req.body;

      // Vérifier que le contrat appartient au locataire connecté
      const [[contrat]] = await pool.execute(
        'SELECT * FROM contrats WHERE id = ? AND locataire_id = ?',
        [contrat_id, req.user.locataire_id]
      );

      if (!contrat) {
        return res.status(403).json({ error: 'Contrat non autorisé' });
      }

      const photo_eau = req.files?.photo_eau?.[0]?.filename || null;
      const photo_paiement = req.files?.photo_paiement?.[0]?.filename || null;

      // Enregistrer le paiement
      const [result] = await pool.execute(
        `INSERT INTO paiements 
         (contrat_id, date_paiement, montant_paye, mode_paiement, mois_concerne, photo_eau, photo_paiement)
         VALUES (?, NOW(), ?, ?, ?, ?, ?)`,
        [contrat_id, montant_paye, mode_paiement, mois_concerne, photo_eau, photo_paiement]
      );

      // Mettre à jour l'index eau dans le contrat
      await pool.execute(
        'UPDATE contrats SET nouvel_index_eau = ?, date_releve_eau = ? WHERE id = ?',
        [nouvel_index_eau, date_releve_eau, contrat_id]
      );

      res.status(201).json({
        id: result.insertId,
        message: 'Paiement soumis avec succès',
        photo_eau,
        photo_paiement
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Générer quittance de loyer
router.post('/generer-quittance/:paiement_id', authenticate, isLocataire, async (req, res) => {
  try {
    const [paiements] = await pool.execute(`
      SELECT p.*, 
             c.montant_loyer, c.charges, c.charges_structurelles,
             c.montant_eau, c.montant_internet, c.tva,
             c.ancien_index_eau, c.nouvel_index_eau, c.date_releve_eau,
             l.nom AS locataire_nom, 
             b.adresse AS bien_adresse
      FROM paiements p
      JOIN contrats c ON p.contrat_id = c.id
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      WHERE p.id = ? AND l.id = ?
    `, [req.params.paiement_id, req.user.locataire_id]);

    if (!paiements.length) {
      return res.status(404).json({ error: 'Paiement non trouvé' });
    }

    const pdf = await pdfService.generateQuittance(paiements[0]);
    res.json({ 
      message: 'Quittance générée',
      url: `/documents/${pdf.fileName}`,
      numeroQuittance: pdf.numeroQuittance
    });
  } catch (error) {
    console.error('Erreur génération quittance locataire:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mes paiements
router.get('/mes-paiements', authenticate, isLocataire, async (req, res) => {
  try {
    const [paiements] = await pool.execute(
      `SELECT p.*, c.montant_loyer, b.adresse as bien_adresse
       FROM paiements p
       JOIN contrats c ON p.contrat_id = c.id
       JOIN biens b ON c.bien_id = b.id
       WHERE c.locataire_id = ?
       ORDER BY p.date_paiement DESC`,
      [req.user.locataire_id]
    );
    res.json(paiements);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route pour récupérer les échéances ET les rappels du locataire connecté
router.get('/mes-echeances', authenticate, isLocataire, async (req, res) => {
  try {
    console.log('========================================');
    console.log('🔍 DÉBUT RÉCUPÉRATION ÉCHÉANCES');
    console.log('👤 User:', JSON.stringify(req.user, null, 2));
    console.log('👤 Locataire ID:', req.user.locataire_id);
    
    const jourActuel = new Date().getDate();
    const moisActuel = new Date();
    const moisConcerne = `${moisActuel.getFullYear()}-${String(moisActuel.getMonth() + 1).padStart(2, '0')}-01`;
    const joursRetard = Math.max(0, jourActuel - 10);
    
    console.log('📅 Jour actuel:', jourActuel);
    console.log('📆 Mois concerné:', moisConcerne);
    console.log('⏰ Jours de retard:', joursRetard);
    
    // 1. Récupérer les échéances non payées (après le 10)
    let echeances = [];
    if (jourActuel > 10) {
      console.log('✅ Jour > 10, recherche échéances automatiques...');
      const [echeancesData] = await pool.execute(`
        SELECT 
          c.id as contrat_id,
          c.montant_loyer + COALESCE(c.charges, 0) as montant_du,
          ? as mois_concerne,
          ? as jours_retard
        FROM contrats c
        LEFT JOIN paiements p ON c.id = p.contrat_id AND p.mois_concerne = ?
        WHERE c.locataire_id = ?
          AND c.statut = 'actif'
          AND p.id IS NULL
      `, [moisConcerne, joursRetard, moisConcerne, req.user.locataire_id]);
      
      echeances = echeancesData;
      console.log('📊 Échéances automatiques trouvées:', echeances.length);
      if (echeances.length > 0) {
        console.log('📋 Détails échéances:', JSON.stringify(echeances, null, 2));
      }
    } else {
      console.log('⏸️ Jour ≤ 10, pas de vérification d\'échéances automatiques');
    }

    // 2. Récupérer les rappels non lus envoyés par l'admin
    console.log('📧 Recherche des rappels admin...');
    const [rappelsData] = await pool.execute(`
      SELECT 
        r.id,
        r.contrat_id,
        r.mois_concerne,
        r.date_envoi,
        r.message,
        r.type,
        r.lu,
        c.montant_loyer + COALESCE(c.charges, 0) as montant_du,
        DATEDIFF(NOW(), r.date_envoi) as jours_depuis_rappel
      FROM rappels_paiement r
      JOIN contrats c ON r.contrat_id = c.id
      WHERE c.locataire_id = ?
        AND r.lu = FALSE
      ORDER BY r.date_envoi DESC
    `, [req.user.locataire_id]);

    console.log('📧 Rappels admin trouvés:', rappelsData.length);
    if (rappelsData.length > 0) {
      console.log('📋 Détails rappels:', JSON.stringify(rappelsData, null, 2));
    }

    // 3. Formater les notifications
    const notifications = [];

    // Ajouter les échéances automatiques
    echeances.forEach((e, index) => {
      let type = 'info';
      let message = '';
      
      if (e.jours_retard > 15) {
        type = 'danger';
        message = `⚠️ URGENT : Votre paiement est en retard de ${e.jours_retard} jours. Veuillez régulariser votre situation immédiatement pour éviter des pénalités.`;
      } else if (e.jours_retard > 5) {
        type = 'warning';
        message = `Votre loyer du mois est en retard de ${e.jours_retard} jours. Merci de procéder au paiement rapidement.`;
      } else {
        type = 'info';
        message = `Le paiement de votre loyer du mois était attendu le 10. Merci de régulariser votre situation.`;
      }
      
      notifications.push({
        id: `echeance-${e.contrat_id}-${index}`,
        type,
        message,
        montant: Number(e.montant_du),
        joursRetard: e.jours_retard,
        moisConcerne: e.mois_concerne,
        source: 'automatique'
      });
    });

    // Ajouter les rappels de l'admin
    rappelsData.forEach((r) => {
      let defaultMessage = `📧 Rappel du propriétaire : Votre loyer n'a pas encore été reçu. Merci de régulariser votre situation.`;
      const message = r.message || defaultMessage;
      
      notifications.push({
        id: `rappel-${r.id}`,
        type: r.type === 'retard' ? 'danger' : 'warning',
        message: `${message} (Rappel envoyé il y a ${r.jours_depuis_rappel} jour${r.jours_depuis_rappel > 1 ? 's' : ''})`,
        montant: Number(r.montant_du),
        joursRetard: 0,
        moisConcerne: r.mois_concerne,
        source: 'admin',
        rappelId: r.id
      });
    });
    
    console.log('📊 Total notifications à envoyer:', notifications.length);
    console.log('📋 Notifications complètes:', JSON.stringify(notifications, null, 2));
    console.log('========================================');
    
    res.json(notifications);
  } catch (error) {
    console.error('❌ ERREUR récupération échéances:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour marquer un rappel comme lu
router.post('/marquer-rappel-lu/:rappel_id', authenticate, isLocataire, async (req, res) => {
  try {
    const rappelId = req.params.rappel_id;

    // Vérifier que le rappel appartient au locataire
    const [rappels] = await pool.execute(`
      SELECT r.* 
      FROM rappels_paiement r
      JOIN contrats c ON r.contrat_id = c.id
      WHERE r.id = ? AND c.locataire_id = ?
    `, [rappelId, req.user.locataire_id]);

    if (rappels.length === 0) {
      return res.status(403).json({ error: 'Rappel non autorisé' });
    }

    // Marquer comme lu
    await pool.execute(
      'UPDATE rappels_paiement SET lu = TRUE WHERE id = ?',
      [rappelId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Erreur marquage rappel:', error);
    res.status(500).json({ error: error.message });
  }
});

// Réinitialiser le mot de passe (admin uniquement)
router.post('/:id/reset-password', authenticate, isAdmin, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const locataireId = req.params.id;
    
    const [[locataire]] = await connection.execute(
      'SELECT telephone FROM locataires WHERE id = ?',
      [locataireId]
    );
    
    if (!locataire) {
      return res.status(404).json({ error: 'Locataire non trouvé' });
    }
    
    const newPassword = locataire.telephone.replace(/\s/g, '');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await connection.execute(
      'UPDATE users SET password = ? WHERE locataire_id = ?',
      [hashedPassword, locataireId]
    );
    
    res.json({
      message: 'Mot de passe réinitialisé',
      newPassword: newPassword,
      info: 'Le mot de passe a été réinitialisé avec le numéro de téléphone'
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

module.exports = router;