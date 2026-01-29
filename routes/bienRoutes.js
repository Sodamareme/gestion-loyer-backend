const express = require('express');
const router = express.Router();
const bienController = require('../controllers/bienController');

// Route publique
router.get('/disponibles', bienController.getBiensDisponibles);

// Routes protégées
router.get('/', bienController.getBiens);
router.post('/', bienController.uploadPhotos, bienController.createBien);
router.get('/stats/agence/:agence_id', bienController.getStatsByAgence);

router.put('/:id', bienController.uploadPhotos, bienController.updateBien);
router.delete('/:id/photo', bienController.deletePhoto);
router.delete('/:id', bienController.deleteBien);

// Statistiques par agence

module.exports = router;