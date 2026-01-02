const express = require('express');
const router = express.Router();
const contratController = require('../controllers/contratController');

// ⚠️ Routes spécifiques AVANT les routes avec paramètres
router.get('/actifs', contratController.getContratsActifs);
router.get('/archives', contratController.getContratsArchives);

// Routes générales
router.post('/', contratController.createContrat);
router.get('/', contratController.getContrats);

// Routes avec paramètres à la fin
router.put('/:id', contratController.updateContrat); 
router.post('/:id/archiver', contratController.archiverContrat);
router.post('/:id/desarchiver', contratController.desarchiverContrat); 

module.exports = router;