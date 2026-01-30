const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { authenticate, isAdmin } = require('../middleware/auth');

// ✅ LOGIN avec logs détaillés
router.post('/login', async (req, res) => {
  try {
    console.log('📧 === TENTATIVE DE CONNEXION ===');
    console.log('Email:', req.body.email);
    console.log('IP:', req.ip);
    
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      console.log('❌ Champs manquants');
      return res.status(400).json({ 
        error: 'Email et mot de passe requis' 
      });
    }

    // Appel au service d'authentification
    const result = await authService.login(email, password);
    
    console.log('✅ Connexion réussie pour:', email);
    console.log('📦 Données utilisateur:', {
      id: result.user.id,
      role: result.user.role,
      locataire_id: result.user.locataire_id,
      proprietaire_id: result.user.proprietaire_id,
      agence_id: result.user.agence_id,
      agence_nom: result.user.agence_nom
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Erreur login:', error.message);
    console.error('Stack:', error.stack);
    
    // Retourner le message d'erreur
    res.status(401).json({ 
      error: error.message || 'Erreur de connexion'
    });
  }
});

// ✅ Vérifier le token
router.get('/verify', authenticate, (req, res) => {
  console.log('✅ Token vérifié pour:', req.user.email);
  
  res.json({ 
    valid: true, 
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      locataire_id: req.user.locataire_id,
      locataire_nom: req.user.locataire_nom,
      proprietaire_id: req.user.proprietaire_id,
      proprietaire_nom: req.user.proprietaire_nom,
      agence_id: req.user.agence_id,
      agence_nom: req.user.agence_nom,
      agence_code: req.user.agence_code
    }
  });
});

// ✅ Récupérer l'utilisateur connecté
router.get('/me', authenticate, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      locataire_id: req.user.locataire_id,
      locataire_nom: req.user.locataire_nom,
      proprietaire_id: req.user.proprietaire_id,
      proprietaire_nom: req.user.proprietaire_nom,
      agence_id: req.user.agence_id,
      agence_nom: req.user.agence_nom,
      agence_code: req.user.agence_code
    }
  });
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
    
    console.log('✅ Compte locataire créé:', { userId, locataire_id, email });
    
    res.status(201).json({ 
      id: userId, 
      message: 'Compte locataire créé avec succès' 
    });
    
  } catch (error) {
    console.error('❌ Erreur création compte:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la création du compte'
    });
  }
});

// Créer un compte propriétaire (Admin uniquement)
router.post('/create-proprietaire-account', authenticate, isAdmin, async (req, res) => {
  try {
    const { proprietaire_id, email, password } = req.body;
    
    if (!proprietaire_id || !email || !password) {
      return res.status(400).json({ 
        error: 'Tous les champs sont requis' 
      });
    }
    
    const userId = await authService.createProprietaireUser(proprietaire_id, email, password);
    
    console.log('✅ Compte propriétaire créé:', { userId, proprietaire_id, email });
    
    res.status(201).json({ 
      id: userId, 
      message: 'Compte propriétaire créé avec succès' 
    });
    
  } catch (error) {
    console.error('❌ Erreur création compte:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la création du compte'
    });
  }
});

// Créer un compte agence (Admin uniquement - backup manuel)
router.post('/create-agence-account', authenticate, isAdmin, async (req, res) => {
  try {
    const { agence_id, email, telephone } = req.body;
    
    if (!agence_id || !email || !telephone) {
      return res.status(400).json({ 
        error: 'Tous les champs sont requis (agence_id, email, telephone)' 
      });
    }
    
    const userId = await authService.createAgenceUser(agence_id, email, telephone);
    
    console.log('✅ Compte agence créé:', { userId, agence_id, email });
    
    res.status(201).json({ 
      id: userId, 
      message: 'Compte agence créé avec succès',
      credentials: {
        email: email,
        password: telephone,
        note: 'Le mot de passe est le numéro de téléphone'
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur création compte agence:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la création du compte'
    });
  }
});
// Route pour changer le mot de passe
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Ancien et nouveau mot de passe requis' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
    }

    const pool = require('../config/db');
    const result = await pool.execute(
      'SELECT password FROM users WHERE id = $1',
      [userId]
    );

    if (!result || !result[0] || result[0].length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const user = result[0][0];

    const bcrypt = require('bcrypt');
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.execute(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, userId]
    );

    console.log('✅ Mot de passe changé pour user_id:', userId);

    res.json({ message: 'Mot de passe changé avec succès' });

  } catch (error) {
    console.error('❌ Erreur changement mot de passe:', error);
    res.status(500).json({ error: 'Erreur lors du changement de mot de passe' });
  }
});

// Route pour changer l'email
router.put('/change-email', authenticate, authService.changeEmail);
module.exports = router;