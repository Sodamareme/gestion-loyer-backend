const express = require('express');
const router = express.Router();
const bienController = require('../controllers/bienController');

router.post('/', bienController.createBien);
router.get('/', bienController.getBiens);
router.get('/disponibles', bienController.getBiensDisponibles);
router.put('/:id', bienController.updateBien);     // ✏️ Modifier
router.delete('/:id', bienController.deleteBien);  // 🗑️ Supprimer

module.exports = router;
