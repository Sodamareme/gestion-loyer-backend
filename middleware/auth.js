const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ✅ Middleware d'authentification CORRIGÉ avec agence_id
exports.authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    console.log('🔍 Token décodé:', decoded);

    // ✅ CORRECTION: Récupérer AUSSI les infos de l'agence
    const userResult = await pool.query(
      `SELECT u.*, 
              l.id as locataire_id, 
              l.nom as locataire_nom,
              p.id as proprietaire_id,
              p.nom as proprietaire_nom,
              a.id as agence_id,
              a.nom as agence_nom,
              a.code as agence_code
       FROM users u
       LEFT JOIN locataires l ON u.locataire_id = l.id
       LEFT JOIN proprietaires p ON u.proprietaire_id = p.id
       LEFT JOIN agences a ON u.agence_id = a.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    const user = userResult.rows[0];
    
    console.log('🔍 Utilisateur authentifié:', {
      id: user.id,
      email: user.email,
      role: user.role,
      locataire_id: user.locataire_id,
      proprietaire_id: user.proprietaire_id,
      agence_id: user.agence_id,
      agence_nom: user.agence_nom,
      agence_code: user.agence_code
    });

    // ✅ CORRECTION: Attacher TOUTES les infos y compris agence
    req.user = {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
      locataire_id: user.locataire_id,
      locataire_nom: user.locataire_nom,
      proprietaire_id: user.proprietaire_id,
      proprietaire_nom: user.proprietaire_nom,
      agence_id: user.agence_id,
      agence_nom: user.agence_nom,
      agence_code: user.agence_code
    };

    next();
  } catch (error) {
    console.error('❌ Erreur authentification:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token invalide' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré' });
    }
    
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

// ✅ CORRECTION: Exporter requireRole
exports.requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Non authentifié' });
      }

      if (!allowedRoles.includes(req.user.role)) {
        console.log('🚫 Accès refusé:', {
          user: req.user.email,
          role: req.user.role,
          required: allowedRoles
        });
        return res.status(403).json({ 
          error: `Accès refusé - Rôles autorisés: ${allowedRoles.join(', ')}` 
        });
      }

      console.log('✅ Accès autorisé pour:', req.user.email, 'Role:', req.user.role);
      next();
    } catch (error) {
      console.error('❌ Erreur requireRole:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  };
};

// Middleware pour admin OU propriétaire
exports.isAdminOrProprietaire = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'proprietaire') {
    return res.status(403).json({ 
      error: 'Accès refusé - Admin ou Propriétaire uniquement' 
    });
  }
  next();
};

// Middleware pour admin uniquement
exports.isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Accès refusé - Admin uniquement' 
    });
  }
  next();
};

// Middleware pour propriétaire uniquement
exports.isProprietaire = (req, res, next) => {
  if (req.user.role !== 'proprietaire') {
    return res.status(403).json({ 
      error: 'Accès refusé - Propriétaire uniquement' 
    });
  }
  
  if (!req.user.proprietaire_id) {
    return res.status(400).json({ 
      error: 'ID propriétaire manquant. Votre compte n\'est pas correctement configuré.' 
    });
  }
  
  next();
};

// Middleware pour locataire uniquement
exports.isLocataire = (req, res, next) => {
  if (req.user.role !== 'locataire') {
    return res.status(403).json({ 
      error: 'Accès refusé - Locataire uniquement' 
    });
  }
  
  if (!req.user.locataire_id) {
    return res.status(400).json({ 
      error: 'ID locataire manquant. Votre compte n\'est pas correctement configuré.' 
    });
  }
  
  next();
};

// ✅ Middleware pour agence uniquement
exports.isAgence = (req, res, next) => {
  if (req.user.role !== 'agence') {
    return res.status(403).json({ 
      error: 'Accès refusé - Agence uniquement' 
    });
  }
  
  if (!req.user.agence_id) {
    return res.status(400).json({ 
      error: 'ID agence manquant. Votre compte n\'est pas correctement configuré.' 
    });
  }
  
  next();
};

// ✅ Middleware pour admin OU agence
exports.isAdminOrAgence = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'agence') {
    return res.status(403).json({ 
      error: 'Accès réservé aux administrateurs et agences' 
    });
  }
  next();
};

// ✅ Alias pour compatibilité
exports.authenticateToken = exports.authenticate;