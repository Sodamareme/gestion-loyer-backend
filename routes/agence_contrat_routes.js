const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const agenceContratController = require('../controllers/agenceContratController');
const agencePDFController = require('../controllers/agencePDFController');
const agenceEcheancesController = require('../controllers/agenceEcheancesController');

// ⚠️ IMPORTANT : Les routes spécifiques DOIVENT être AVANT les routes avec paramètres dynamiques

// 👥 Locataires de l'agence
router.get('/locataires', authenticateToken, requireRole(['agence']), agenceContratController.getLocatairesAgence);

// 📋 Contrats de l'agence - Routes spécifiques d'abord
router.get('/contrats/actifs', authenticateToken, requireRole(['agence']), agenceContratController.getContratsActifsAgence);
router.get('/contrats/archives', authenticateToken, requireRole(['agence']), agenceContratController.getContratsArchivesAgence);

// Puis les routes génériques
router.get('/contrats', authenticateToken, requireRole(['agence']), agenceContratController.getContratsAgence);
// Récupérer les échéances impayées de l'agence
router.get(
  '/echeances-impayees',
  authenticateToken,
  requireRole(['agence']),
  agenceEcheancesController.getEcheancesImpayeesAgence
);

// Envoyer un rappel de paiement
router.post(
  '/envoyer-rappel',
  authenticateToken,
  requireRole(['agence']),
  agenceEcheancesController.envoyerRappelAgence
);
router.post('/contrats', authenticateToken, requireRole(['agence']), agenceContratController.createContratAgence);
router.get('/contrats/:id/pdf', 
  authenticateToken, 
  requireRole(['agence']), 
  agenceContratController.downloadContratPDF
);

// Enfin les routes avec paramètres dynamiques :id
router.put('/contrats/:id', authenticateToken, requireRole(['agence']), agenceContratController.updateContratAgence);

router.post('/contrats/:id/archiver', authenticateToken, requireRole(['agence']), agenceContratController.archiverContratAgence);
router.post('/contrats/:id/desarchiver', authenticateToken, requireRole(['agence']), agenceContratController.desarchiverContratAgence);
// Locataires

// ==========================================
// 🆕 NOUVELLES ROUTES PDF
// ==========================================

// Génération de documents PDF pour les agences
router.post(
  '/pdf/quittance/:paiementId',
  authenticateToken,
  requireRole(['agence']),
  agencePDFController.generateQuittanceAgence
);

router.post(
  '/pdf/avis-echeance/:contratId',
  authenticateToken,
  requireRole(['agence']),
  agencePDFController.generateAvisEcheanceAgence
);

router.post(
  '/pdf/quittance-caution/:contratId',
  authenticateToken,
  requireRole(['agence']),
  agencePDFController.generateQuittanceCautionAgence
);

// Récupérer les paiements de l'agence
router.get(
  '/paiements',
  authenticateToken,
  requireRole(['agence']),
  agencePDFController.getPaiementsAgence
);
module.exports = router;