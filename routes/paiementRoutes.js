const express = require('express');
const router = express.Router();
const paiementController = require('../controllers/paiementController');

// 📌 Routes spécifiques (TOUJOURS en premier)
// router.get('/historique/pdf/:contrat_id', paiementController.historiqueParContratPDF);
router.get('/historique/pdf', paiementController.telechargerHistoriquePDF);

// 📌 CRUD paiements
router.post('/', paiementController.createPaiement);
router.get('/', paiementController.getPaiements);
router.get('/contrat/:contrat_id', paiementController.getPaiementsByContrat);
router.put('/:id', paiementController.updatePaiement);

module.exports = router;
