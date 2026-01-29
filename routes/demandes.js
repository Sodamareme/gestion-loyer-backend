// routes/demandes.js
const express = require('express');
const pool = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/demandes/publique
 * Créer une demande publique (sans authentification)
 * Pour les personnes qui ne sont pas encore connectées
 */
// Dans routes/demandes.js
// Route POST /api/demandes/publique

router.post('/publique', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const {
      agence_id,
      bien_id,
      nom,
      prenom,
      telephone,
      email,
      adresse_bien,
      type,
      sujet,
      description,
      urgence
    } = req.body;

    console.log('📝 === CRÉATION DEMANDE PUBLIQUE ===');
    console.log('Données reçues:', { agence_id, bien_id, nom, telephone, email });

    // Validation
    if (!agence_id || !nom || !telephone || !type || !sujet || !description || !urgence) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Tous les champs obligatoires doivent être remplis' 
      });
    }

    // Vérifier l'agence
    const { rows: agenceRows } = await client.query(
      'SELECT id, nom, telephone, email, actif FROM agences WHERE id = $1',
      [agence_id]
    );

    if (agenceRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Agence non trouvée' });
    }

    const agence = agenceRows[0];

    if (!agence.actif) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cette agence n\'est pas active' });
    }

    // Vérifier le bien si fourni
    let bienVerifie = null;
    if (bien_id) {
      const { rows: bienRows } = await client.query(
        'SELECT id, numero_bien, adresse FROM biens WHERE id = $1',
        [bien_id]
      );

      if (bienRows.length > 0) {
        bienVerifie = bienRows[0];
        console.log('✅ Bien trouvé:', bienVerifie.numero_bien);
      }
    }

    // 🔹 CORRECTION : Chercher le locataire par EMAIL ET téléphone
    let locataire_id = null;
    
    // D'abord essayer par email si fourni
    if (email) {
      const { rows: locataireByEmail } = await client.query(
        'SELECT id, nom, telephone FROM locataires WHERE email = $1 LIMIT 1',
        [email]
      );
      
      if (locataireByEmail.length > 0) {
        locataire_id = locataireByEmail[0].id;
        console.log('✅ Locataire trouvé par EMAIL:', locataire_id, '-', locataireByEmail[0].nom);
      }
    }
    
    // Si pas trouvé par email, essayer par téléphone
    if (!locataire_id && telephone) {
      const { rows: locataireByTel } = await client.query(
        'SELECT id, nom, telephone FROM locataires WHERE telephone = $1 LIMIT 1',
        [telephone]
      );
      
      if (locataireByTel.length > 0) {
        locataire_id = locataireByTel[0].id;
        console.log('✅ Locataire trouvé par TÉLÉPHONE:', locataire_id, '-', locataireByTel[0].nom);
      }
    }

    if (!locataire_id) {
      console.log('⚠️ Aucun locataire trouvé avec:', { email, telephone });
      console.log('   La demande sera créée sans locataire_id');
    }

    // Utiliser l'adresse du bien si disponible
    const adresse_finale = bienVerifie?.adresse || adresse_bien;

    // 🔹 IMPORTANT : Insérer avec locataire_id
    const { rows: demandeRows } = await client.query(
      `INSERT INTO demandes_publiques 
       (agence_id, locataire_id, bien_id, nom, prenom, telephone, email, adresse_bien, 
        type, sujet, description, urgence, statut, date_creation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'en_attente', NOW())
       RETURNING id`,
      [agence_id, locataire_id, bien_id || null, nom, prenom, telephone, email, adresse_finale, 
       type, sujet, description, urgence]
    );

    const demande_id = demandeRows[0].id;

    await client.query('COMMIT');

    console.log('✅ Demande publique créée avec ID:', demande_id);
    console.log('   Locataire ID:', locataire_id || 'NON DÉFINI');
    console.log('   Agence:', agence.nom);
    if (bienVerifie) {
      console.log('   Bien:', bienVerifie.numero_bien);
    }

    res.status(201).json({
      id: demande_id,
      message: 'Demande envoyée avec succès',
      agence_nom: agence.nom,
      agence_telephone: agence.telephone,
      agence_email: agence.email,
      bien_numero: bienVerifie?.numero_bien,
      locataire_id: locataire_id, // 🆕 Retourner pour debug
      info: locataire_id 
        ? 'Demande liée à votre compte' 
        : 'Créez un compte pour suivre vos demandes'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur création demande publique:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/demandes
 * Récupérer toutes les demandes pour une agence (normales + publiques)
 * 🔹 CORRECTION : Inclut le bien_id dans les demandes publiques
 */
router.get('/', authenticateToken, requireRole(['agence', 'admin']), async (req, res) => {
  try {
    let demandesNormales = [];
    let demandesPubliques = [];

    if (req.user.role === 'agence') {
      const agence_id = req.user.agence_id;
      
      if (!agence_id) {
        return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
      }

      console.log('📋 Récupération demandes pour agence:', agence_id);

      // Demandes normales (avec contrat)
      const { rows: normales } = await pool.query(
        `SELECT 
          d.*,
          b.numero_bien,
          b.adresse as bien_adresse,
          l.nom as locataire_nom,
          l.prenom as locataire_prenom,
          l.telephone as locataire_telephone,
          l.email as locataire_email,
          'normale' as source_demande
        FROM demandes d
        INNER JOIN biens b ON b.id = d.bien_id
        INNER JOIN locataires l ON l.id = d.locataire_id
        WHERE d.agence_id = $1
        ORDER BY 
          CASE d.statut
            WHEN 'en_attente' THEN 1
            WHEN 'vue' THEN 2
            WHEN 'en_cours' THEN 3
            WHEN 'resolue' THEN 4
            WHEN 'rejetee' THEN 5
          END,
          CASE d.urgence
            WHEN 'urgente' THEN 1
            WHEN 'haute' THEN 2
            WHEN 'normale' THEN 3
            WHEN 'basse' THEN 4
          END,
          d.date_creation DESC`,
        [agence_id]
      );

      // 🆕 CORRECTION : Demandes publiques avec LEFT JOIN sur biens
      const { rows: publiques } = await pool.query(
        `SELECT 
          dp.id,
          dp.locataire_id,
          dp.bien_id,
          dp.type,
          dp.sujet,
          dp.description,
          dp.urgence,
          dp.statut,
          dp.note_agence,
          dp.date_creation,
          dp.date_traitement,
          b.numero_bien,
          COALESCE(b.adresse, dp.adresse_bien) as bien_adresse,
          dp.nom as locataire_nom,
          dp.prenom as locataire_prenom,
          dp.telephone as locataire_telephone,
          dp.email as locataire_email,
          'publique' as source_demande
        FROM demandes_publiques dp
        LEFT JOIN biens b ON b.id = dp.bien_id
        WHERE dp.agence_id = $1
        ORDER BY 
          CASE dp.statut
            WHEN 'en_attente' THEN 1
            WHEN 'vue' THEN 2
            WHEN 'en_cours' THEN 3
            WHEN 'resolue' THEN 4
            WHEN 'rejetee' THEN 5
          END,
          CASE dp.urgence
            WHEN 'urgente' THEN 1
            WHEN 'haute' THEN 2
            WHEN 'normale' THEN 3
            WHEN 'basse' THEN 4
          END,
          dp.date_creation DESC`,
        [agence_id]
      );

      demandesNormales = normales;
      demandesPubliques = publiques;

    } else if (req.user.role === 'admin') {
      console.log('📋 Récupération de toutes les demandes (admin)');

      const { rows: normales } = await pool.query(
        `SELECT 
          d.*,
          b.numero_bien,
          b.adresse as bien_adresse,
          l.nom as locataire_nom,
          l.prenom as locataire_prenom,
          l.telephone as locataire_telephone,
          l.email as locataire_email,
          a.nom as agence_nom,
          'normale' as source_demande
        FROM demandes d
        INNER JOIN biens b ON b.id = d.bien_id
        INNER JOIN locataires l ON l.id = d.locataire_id
        LEFT JOIN agences a ON a.id = d.agence_id
        ORDER BY d.date_creation DESC`
      );

      const { rows: publiques } = await pool.query(
        `SELECT 
          dp.id,
          dp.locataire_id,
          dp.bien_id,
          dp.type,
          dp.sujet,
          dp.description,
          dp.urgence,
          dp.statut,
          dp.note_agence,
          dp.date_creation,
          dp.date_traitement,
          b.numero_bien,
          COALESCE(b.adresse, dp.adresse_bien) as bien_adresse,
          dp.nom as locataire_nom,
          dp.prenom as locataire_prenom,
          dp.telephone as locataire_telephone,
          dp.email as locataire_email,
          a.nom as agence_nom,
          'publique' as source_demande
        FROM demandes_publiques dp
        LEFT JOIN biens b ON b.id = dp.bien_id
        LEFT JOIN agences a ON a.id = dp.agence_id
        ORDER BY dp.date_creation DESC`
      );

      demandesNormales = normales;
      demandesPubliques = publiques;
    }

    // Combiner et trier toutes les demandes
    const toutesDemandes = [...demandesNormales, ...demandesPubliques];
    
    console.log('✅ Demandes trouvées:', toutesDemandes.length, 
                '(normales:', demandesNormales.length, 
                '+ publiques:', demandesPubliques.length, ')');

    res.json(toutesDemandes);

  } catch (error) {
    console.error('❌ Erreur récupération demandes:', error);
    res.status(500).json({ error: error.message });
  }
});
/**
 * POST /api/demandes
 * Créer une nouvelle demande (locataire uniquement)
 */
/**
 * POST /api/demandes
 * Créer une nouvelle demande (locataire uniquement)
 * ✅ CORRECTION : Récupère l'agence_id directement depuis le bien
 */
router.post('/', authenticateToken, requireRole(['locataire']), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { bien_id, type, sujet, description, urgence } = req.body;
    const locataire_id = req.user.locataire_id;

    console.log('📝 === CRÉATION DEMANDE LOCATAIRE ===');
    console.log('Locataire ID:', locataire_id);
    console.log('Bien ID:', bien_id);
    console.log('Type:', type);
    console.log('Sujet:', sujet);

    // Validation
    if (!locataire_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Aucun locataire associé à ce compte' });
    }

    if (!bien_id || !type || !sujet || !description || !urgence) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Tous les champs obligatoires doivent être remplis' 
      });
    }

    // ✅ CORRECTION : Récupérer le bien avec son agence_id
    const { rows: bienRows } = await client.query(
      'SELECT id, numero_bien, adresse, agence_id FROM biens WHERE id = $1',
      [bien_id]
    );

    if (bienRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bien non trouvé' });
    }

    const bien = bienRows[0];
    console.log('🏠 Bien trouvé:', bien.numero_bien);
    console.log('   Agence ID du bien:', bien.agence_id);

    // Vérifier que le locataire a un contrat actif pour ce bien
    const { rows: contratRows } = await client.query(
      `SELECT c.id, c.agence_id as contrat_agence_id
       FROM contrats c
       WHERE c.locataire_id = $1 
         AND c.bien_id = $2 
         AND c.statut = 'actif'
         AND (c.archive IS NULL OR c.archive = false)
       LIMIT 1`,
      [locataire_id, bien_id]
    );

    if (contratRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        error: 'Vous n\'avez pas de contrat actif pour ce bien' 
      });
    }

    const contrat = contratRows[0];
    console.log('📄 Contrat actif trouvé:', contrat.id);
    console.log('   Agence ID du contrat:', contrat.contrat_agence_id);

    // ✅ Prioriser l'agence_id du bien, sinon celle du contrat, sinon NULL
    const agence_id = bien.agence_id || contrat.contrat_agence_id || null;
    
    console.log('🎯 Agence ID final retenu:', agence_id);

    // Récupérer les infos de l'agence si elle existe
    let agence = null;
    if (agence_id) {
      const { rows: agenceRows } = await client.query(
        'SELECT nom, telephone, email FROM agences WHERE id = $1',
        [agence_id]
      );
      
      if (agenceRows.length > 0) {
        agence = agenceRows[0];
        console.log('✅ Agence trouvée:', agence.nom);
      } else {
        console.log('⚠️ Agence ID existe mais agence non trouvée');
      }
    } else {
      console.log('⚠️ Aucune agence associée - demande visible admin uniquement');
    }

    // Créer la demande
    const { rows: demandeRows } = await client.query(
      `INSERT INTO demandes 
       (locataire_id, bien_id, agence_id, type, sujet, description, urgence, statut, date_creation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'en_attente', NOW())
       RETURNING id`,
      [locataire_id, bien_id, agence_id, type, sujet, description, urgence]
    );

    const demande_id = demandeRows[0].id;

    await client.query('COMMIT');

    console.log('✅ Demande créée avec succès - ID:', demande_id);

    res.status(201).json({
      id: demande_id,
      message: 'Demande envoyée avec succès',
      agence_nom: agence?.nom || 'Administration',
      agence_telephone: agence?.telephone,
      agence_email: agence?.email
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur création demande:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});
/**
 * GET /api/demandes/mes-demandes
 * Récupérer toutes les demandes d'un locataire
 */
router.get('/mes-demandes', authenticateToken, requireRole(['locataire']), async (req, res) => {
  try {
    const locataire_id = req.user.locataire_id;

    if (!locataire_id) {
      return res.status(403).json({ error: 'Aucun locataire associé à ce compte' });
    }

    console.log('📋 Récupération TOUTES les demandes pour locataire:', locataire_id);

    // 🔹 Demandes normales (avec contrat)
    const { rows: demandesNormales } = await pool.query(
      `SELECT 
        d.*,
        b.numero_bien,
        b.adresse as bien_adresse,
        a.nom as agence_nom,
        a.telephone as agence_telephone,
        a.email as agence_email,
        'normale' as source_demande
       FROM demandes d
       INNER JOIN biens b ON b.id = d.bien_id
       LEFT JOIN agences a ON a.id = d.agence_id
       WHERE d.locataire_id = $1
       ORDER BY d.date_creation DESC`,
      [locataire_id]
    );

    // 🔹 Demandes publiques (avec ou sans bien)
    const { rows: demandesPubliques } = await pool.query(
      `SELECT 
        dp.id,
        dp.locataire_id,
        dp.bien_id,
        dp.type,
        dp.sujet,
        dp.description,
        dp.urgence,
        dp.statut,
        dp.note_agence,
        dp.date_creation,
        dp.date_traitement,
        b.numero_bien,
        COALESCE(b.adresse, dp.adresse_bien) as bien_adresse,
        a.nom as agence_nom,
        a.telephone as agence_telephone,
        a.email as agence_email,
        'publique' as source_demande
       FROM demandes_publiques dp
       LEFT JOIN biens b ON b.id = dp.bien_id
       LEFT JOIN agences a ON a.id = dp.agence_id
       WHERE dp.locataire_id = $1
       ORDER BY dp.date_creation DESC`,
      [locataire_id]
    );

    // Combiner les deux types de demandes
    const toutesLesDemandes = [...demandesNormales, ...demandesPubliques];

    console.log('✅ Demandes trouvées:', toutesLesDemandes.length);
    console.log('   - Normales:', demandesNormales.length);
    console.log('   - Publiques:', demandesPubliques.length);

    res.json(toutesLesDemandes);

  } catch (error) {
    console.error('❌ Erreur récupération demandes locataire:', error);
    res.status(500).json({ error: error.message });
  }
});
/**
 * GET /api/demandes
 * Récupérer toutes les demandes pour une agence (normales + publiques)
 */


/**
 * GET /api/demandes/:id
 * Récupérer les détails d'une demande spécifique
 */
router.get('/:id', authenticateToken, requireRole(['agence', 'locataire', 'admin']), async (req, res) => {
  try {
    const demande_id = req.params.id;

    console.log('🔍 Récupération détails demande:', demande_id);

    const { rows } = await pool.query(
      `SELECT 
        d.*,
        b.numero_bien,
        b.adresse as bien_adresse,
        l.nom as locataire_nom,
        l.prenom as locataire_prenom,
        l.telephone as locataire_telephone,
        l.email as locataire_email,
        a.nom as agence_nom,
        a.telephone as agence_telephone,
        a.email as agence_email
       FROM demandes d
       INNER JOIN biens b ON b.id = d.bien_id
       INNER JOIN locataires l ON l.id = d.locataire_id
       LEFT JOIN agences a ON a.id = d.agence_id
       WHERE d.id = $1`,
      [demande_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }

    const demande = rows[0];

    // Vérifier les permissions
    if (req.user.role === 'locataire' && demande.locataire_id !== req.user.locataire_id) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    if (req.user.role === 'agence' && demande.agence_id !== req.user.agence_id) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    res.json(demande);

  } catch (error) {
    console.error('❌ Erreur récupération détails demande:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/demandes/:id/statut
 * Mettre à jour le statut et la note d'une demande (agence uniquement)
 * Fonctionne pour les demandes normales ET publiques
 */
/**
 * PUT /api/demandes/:id/statut
 * Mettre à jour le statut et la note d'une demande (agence uniquement)
 */
router.put('/:id/statut', authenticateToken, requireRole(['agence', 'admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const demande_id = req.params.id;
    const { statut, note_agence, source_demande } = req.body;

    console.log('📝 === MISE À JOUR DEMANDE ===');
    console.log('Demande ID:', demande_id);
    console.log('Source demande:', source_demande);
    console.log('Nouveau statut:', statut);
    console.log('Note agence:', note_agence);

    // Déterminer la table à utiliser
    const table = source_demande === 'publique' ? 'demandes_publiques' : 'demandes';
    console.log('Table utilisée:', table);

    // Vérifier que la demande existe et appartient à l'agence (si rôle agence)
    if (req.user.role === 'agence') {
      const { rows: checkRows } = await client.query(
        `SELECT id FROM ${table} WHERE id = $1 AND (agence_id = $2 OR agence_id IS NULL)`,
        [demande_id, req.user.agence_id]
      );

      if (checkRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ 
          error: 'Vous n\'avez pas l\'autorisation de modifier cette demande' 
        });
      }
    }

    // ✅ Mise à jour simple et sûre
    if (statut === 'resolue' || statut === 'rejetee') {
      // Avec date de traitement
      await client.query(
        `UPDATE ${table} 
         SET statut = $1, 
             note_agence = COALESCE($2, note_agence), 
             date_traitement = NOW() 
         WHERE id = $3`,
        [statut, note_agence, demande_id]
      );
    } else {
      // Sans date de traitement
      await client.query(
        `UPDATE ${table} 
         SET statut = $1, 
             note_agence = COALESCE($2, note_agence) 
         WHERE id = $3`,
        [statut, note_agence, demande_id]
      );
    }

    await client.query('COMMIT');

    console.log('✅ Demande mise à jour avec succès');

    res.json({ message: 'Demande mise à jour avec succès' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur mise à jour demande:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/demandes/stats/agence
 * Statistiques des demandes pour une agence
 */
router.get('/stats/agence', authenticateToken, requireRole(['agence']), async (req, res) => {
  try {
    const agence_id = req.user.agence_id;

    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    const { rows } = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN statut = 'en_attente' THEN 1 END) as en_attente,
        COUNT(CASE WHEN statut = 'vue' THEN 1 END) as vue,
        COUNT(CASE WHEN statut = 'en_cours' THEN 1 END) as en_cours,
        COUNT(CASE WHEN statut = 'resolue' THEN 1 END) as resolue,
        COUNT(CASE WHEN statut = 'rejetee' THEN 1 END) as rejetee,
        COUNT(CASE WHEN urgence = 'urgente' THEN 1 END) as urgentes,
        COUNT(CASE WHEN urgence = 'haute' THEN 1 END) as haute_priorite
       FROM demandes
       WHERE agence_id = $1`,
      [agence_id]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error('❌ Erreur récupération stats demandes:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;