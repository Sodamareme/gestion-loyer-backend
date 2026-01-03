const express = require('express');
const router = express.Router();
const pdfController = require('../controllers/pdfController');
const { authenticate, isAdmin } = require('../middleware/auth');
const pdfService = require('../services/pdfService');
const pool = require('../config/db');

router.get('/quittances', async (req, res) => {
  try {
    const [quittances] = await pool.execute(`
      SELECT q.*, p.mois_concerne, l.nom AS locataire_nom, b.adresse AS bien_adresse
      FROM quittances q
      JOIN paiements p ON q.paiement_id = p.id
      JOIN contrats c ON p.contrat_id = c.id
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      ORDER BY q.created_at DESC
    `);
    res.json(quittances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/avis-echeance', async (req, res) => {
  try {
    const [avis] = await pool.execute(`
      SELECT a.*, l.nom AS locataire_nom, b.adresse AS bien_adresse
      FROM avis_echeance a
      JOIN contrats c ON a.contrat_id = c.id
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      ORDER BY a.created_at DESC
    `);
    res.json(avis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lister toutes les quittances de caution
router.get('/quittances-caution', async (req, res) => {
  try {
    const [cautions] = await pool.execute(`
      SELECT qc.*, l.nom AS locataire_nom, b.adresse AS bien_adresse
      FROM quittances_caution qc
      JOIN contrats c ON qc.contrat_id = c.id
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      ORDER BY qc.created_at DESC
    `);
    res.json(cautions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route pour récupérer les échéances impayées (après le 10 du mois)
router.get('/echeances-impayees', authenticate, isAdmin, async (req, res) => {
  try {
    console.log('🔍 DÉBUT RECHERCHE ÉCHÉANCES');
    
    const jourActuel = new Date().getDate();
    console.log('📅 Jour actuel:', jourActuel);
    
    // Pour tester, désactivez temporairement cette condition
    if (jourActuel <= 10) {
      console.log('⏸️ Jour <= 10, pas de vérification');
      return res.json([]);
    }

    const moisActuel = new Date();
    const moisConcerne = `${moisActuel.getFullYear()}-${String(moisActuel.getMonth() + 1).padStart(2, '0')}-01`;
    const joursRetard = Math.max(0, jourActuel - 10);

    console.log('📆 Mois concerné:', moisConcerne);
    console.log('⏰ Jours de retard:', joursRetard);

    // Requête SQL pour trouver les contrats sans paiement + état des rappels
    const [echeances] = await pool.execute(`
      SELECT 
        c.id as contrat_id,
        l.id as locataire_id,
        l.nom as locataire_nom,
        l.telephone,
        l.email,
        b.adresse as bien_adresse,
        c.montant_loyer + COALESCE(c.charges_periode, 0) as montant_du,
        $1 as mois_concerne,
        $2 as jours_retard,
        r.id as rappel_id,
        r.date_envoi as rappel_date_envoi,
        r.lu as rappel_lu,
        r.message as rappel_message
      FROM contrats c
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      LEFT JOIN paiements p ON c.id = p.contrat_id AND p.mois_concerne = $3
      LEFT JOIN rappels_paiement r ON c.id = r.contrat_id AND r.mois_concerne = $4
      WHERE c.statut = 'actif'
        AND p.id IS NULL
      ORDER BY r.lu ASC NULLS FIRST, l.nom ASC
    `, [moisConcerne, joursRetard, moisConcerne, moisConcerne]);

    console.log('📊 Nombre d\'échéances trouvées:', echeances.length);

    // Ajouter un ID unique pour chaque échéance
    const echeancesAvecId = echeances.map((e) => ({
      ...e,
      id: `${e.contrat_id}-${moisConcerne}`,
      montant_du: Number(e.montant_du),
      rappel_envoye: !!e.rappel_id,
      rappel_lu: e.rappel_lu === true,
      rappel_date: e.rappel_date_envoi
    }));

    console.log('✅ Réponse envoyée:', echeancesAvecId.length, 'échéances');

    res.json(echeancesAvecId);
  } catch (error) {
    console.error('❌ ERREUR récupération échéances:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour envoyer un rappel
router.post('/envoyer-rappel', authenticate, isAdmin, async (req, res) => {
  try {
    const { contrat_id, mois_concerne, message } = req.body;

    if (!contrat_id || !mois_concerne) {
      return res.status(400).json({ error: 'Contrat et mois requis' });
    }

    console.log('📧 Envoi rappel:', { contrat_id, mois_concerne, message });

    // Enregistrer le rappel dans la base
    await pool.execute(`
      INSERT INTO rappels_paiement (contrat_id, mois_concerne, date_envoi, message, type, lu)
      VALUES ($1, $2, CURRENT_TIMESTAMP, $3, 'retard', FALSE)
    `, [contrat_id, mois_concerne, message || null]);

    console.log('✅ Rappel enregistré avec succès');

    res.json({ success: true, message: 'Rappel enregistré' });
  } catch (error) {
    console.error('Erreur envoi rappel:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/quittance/:paiement_id', pdfController.generateQuittance);
router.post('/avis-echeance/:contrat_id', pdfController.generateAvisEcheance);
router.post('/quittance-caution/:contrat_id', pdfController.generateQuittanceCaution);

module.exports = router;