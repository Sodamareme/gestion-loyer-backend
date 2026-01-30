const express = require('express');
const router = express.Router();
const locataireController = require('../controllers/locataireController');
const { authenticate, isAdmin, requireRole } = require('../middleware/auth'); // ✅ Ajouter requireRole

// Vérifier si authMiddleware existe


// 🆕 Routes de validation (AVANT les routes génériques avec :id)
router.get('/en-attente', locataireController.getLocatairesEnAttente);


router.get(
  '/mes-contrats',
  authenticate,
  requireRole(['locataire']),
  locataireController.getMesContrats
);

// Récupérer le contrat actif du locataire
router.get(
  '/mon-contrat',
  authenticate,
  requireRole(['locataire']),
  locataireController.getMonContrat
);

router.get(
  '/mes-documents',
  authenticate,
  requireRole(['locataire']),
  locataireController.getMesDocuments
);

// Récupérer les statistiques des documents
router.get(
  '/mes-documents/stats',
  authenticate,
  requireRole(['locataire']),
  locataireController.getStatsDocuments
);

// Récupérer les documents par type
router.get(
  '/mes-documents/type/:type',
  authenticate,
  requireRole(['locataire']),
  locataireController.getDocumentsByType
);

// Récupérer les détails d'un document
router.get(
  '/mes-documents/:id',
  authenticate,
  requireRole(['locataire']),
  locataireController.getDocumentDetails
);

// Télécharger un document
router.get(
  '/mes-documents/:id/download',
  authenticate,
  requireRole(['locataire']),
  locataireController.downloadDocument
);
router.post('/:id/valider', locataireController.validerLocataire);
router.post('/:id/rejeter', locataireController.rejeterLocataire);

// Routes CRUD classiques
router.get('/', locataireController.getAllLocataires);
router.get('/:id', locataireController.getLocataireById);
router.put('/:id', locataireController.updateLocataire);


module.exports = router;