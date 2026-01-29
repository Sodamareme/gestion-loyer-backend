const express = require('express');
const router = express.Router();
const proprietaireController = require('../controllers/proprietaireController');

// 🆕 Routes de validation (AVANT les routes génériques avec :id)
router.get('/en-attente', proprietaireController.getProprietairesEnAttente);
router.post('/:id/valider', proprietaireController.validerProprietaire);
router.post('/:id/rejeter', proprietaireController.rejeterProprietaire);

// Routes CRUD classiques
router.post('/', proprietaireController.createProprietaire);
router.get('/', proprietaireController.getAllProprietaires);
router.get('/:id', proprietaireController.getProprietaireById);
router.put('/:id', proprietaireController.updateProprietaire);

module.exports = router;