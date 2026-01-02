
const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { authenticate, isAdmin } = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Vérifier le token
router.get('/verify', authenticate, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Créer un compte locataire (Admin uniquement)
router.post('/create-locataire-account', authenticate, isAdmin, async (req, res) => {
  try {
    const { locataire_id, email, password } = req.body;
    const userId = await authService.createLocataireUser(locataire_id, email, password);
    res.status(201).json({ id: userId, message: 'Compte locataire créé' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;