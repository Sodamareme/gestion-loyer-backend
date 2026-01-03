const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { authenticate, isAdmin } = require('../middleware/auth');

// Login avec gestion d'erreurs améliorée
router.post('/login', async (req, res) => {
  try {
    console.log('📧 Tentative de connexion:', req.body.email);
    
    const { email, password } = req.body;

    // Validation des champs
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email et mot de passe requis' 
      });
    }

    const result = await authService.login(email, password);
    
    console.log('✅ Connexion réussie pour:', email);
    res.json(result);
    
  } catch (error) {
    console.error('❌ Erreur login:', error.message);
    
    // Retourner le message d'erreur complet
    res.status(401).json({ 
      error: error.message || 'Erreur de connexion'
    });
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
    
    if (!locataire_id || !email || !password) {
      return res.status(400).json({ 
        error: 'Tous les champs sont requis' 
      });
    }
    
    const userId = await authService.createLocataireUser(locataire_id, email, password);
    res.status(201).json({ 
      id: userId, 
      message: 'Compte locataire créé' 
    });
    
  } catch (error) {
    console.error('❌ Erreur création compte:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la création du compte'
    });
  }
});

module.exports = router;