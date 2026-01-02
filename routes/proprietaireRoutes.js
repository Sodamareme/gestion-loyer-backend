const express = require('express');
const router = express.Router();
const proprietaireController = require('../controllers/proprietaireController');

router.post('/', proprietaireController.createProprietaire);
router.get('/', proprietaireController.getAllProprietaires); 
router.get('/:id', proprietaireController.getProprietaireById);
router.put('/:id', proprietaireController.updateProprietaire);

module.exports = router;
