const express = require('express');
const router = express.Router();
const locataireController = require('../controllers/locataireController');

// Vérifier si authMiddleware existe


// 🆕 Routes de validation (AVANT les routes génériques avec :id)
router.get('/en-attente', locataireController.getLocatairesEnAttente);
router.post('/:id/valider', locataireController.validerLocataire);
router.post('/:id/rejeter', locataireController.rejeterLocataire);

// Routes CRUD classiques
router.get('/', locataireController.getAllLocataires);
router.get('/:id', locataireController.getLocataireById);
router.put('/:id', locataireController.updateLocataire);


module.exports = router;