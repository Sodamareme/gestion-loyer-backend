const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_jwt_super_securise';

// Fonction de login avec vérification du statut de validation ET support agences
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Tentative de connexion:', email);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Récupérer l'utilisateur
    console.log('🔍 Recherche utilisateur:', email);
    const result = await pool.execute(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    // Vérifier si l'utilisateur existe
    if (!result || !result[0] || result[0].length === 0) {
      console.log('❌ Utilisateur non trouvé');
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const user = result[0][0];
    console.log('👤 Utilisateur trouvé:', {
      id: user.id,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      locataire_id: user.locataire_id,
      agence_id: user.agence_id
    });

    // Vérifier le mot de passe
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('❌ Mot de passe incorrect');
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    console.log('✅ Mot de passe correct');

    // 🔒 VÉRIFICATION CRITIQUE : Vérifier si le compte est actif
    console.log('🔒 Vérification is_active:', user.is_active, 'Type:', typeof user.is_active);
    
    if (user.is_active === false || user.is_active === 0 || user.is_active === 'false' || !user.is_active) {
      console.log('🚫 COMPTE DÉSACTIVÉ - Connexion refusée');
      return res.status(403).json({ 
        error: 'Votre compte a été désactivé. Veuillez contacter l\'administrateur.',
        status: 'desactive'
      });
    }

    console.log('✅ Compte actif, vérification du statut de validation...');

    // 🆕 Vérifier le statut pour les agences
    if (user.role === 'agence' && user.agence_id) {
      console.log('🔍 Vérification du statut agence pour ID:', user.agence_id);
      const agenceResult = await pool.execute(
        'SELECT actif FROM agences WHERE id = $1',
        [user.agence_id]
      );

      if (agenceResult && agenceResult[0] && agenceResult[0].length > 0) {
        const agence = agenceResult[0][0];
        console.log('📋 Statut agence actif:', agence.actif);
        
        // Bloquer si l'agence est désactivée
        if (!agence.actif) {
          console.log('🚫 AGENCE DÉSACTIVÉE - Connexion refusée');
          return res.status(403).json({ 
            error: 'Votre agence a été désactivée. Veuillez contacter l\'administrateur.',
            status: 'agence_desactivee'
          });
        }
      }
    }

    // 🆕 Vérifier le statut pour les locataires
    if (user.role === 'locataire' && user.locataire_id) {
      console.log('🔍 Vérification du statut locataire pour ID:', user.locataire_id);
      const locataireResult = await pool.execute(
        'SELECT statut_validation, motif_rejet FROM locataires WHERE id = $1',
        [user.locataire_id]
      );

      if (locataireResult && locataireResult[0] && locataireResult[0].length > 0) {
        const locataire = locataireResult[0][0];
        console.log('📋 Statut locataire:', locataire.statut_validation);
        
        // Bloquer si le compte est rejeté
        if (locataire.statut_validation === 'rejete') {
          console.log('🚫 COMPTE REJETÉ - Connexion refusée');
          return res.status(403).json({ 
            error: `Votre compte a été rejeté et désactivé. ${locataire.motif_rejet ? 'Motif : ' + locataire.motif_rejet : 'Veuillez contacter l\'administrateur.'}`,
            status: 'rejete',
            motif: locataire.motif_rejet
          });
        }
      }
    }

    // 🆕 Vérifier le statut pour les propriétaires
    if (user.role === 'proprietaire' && user.proprietaire_id) {
      console.log('🔍 Vérification du statut propriétaire pour ID:', user.proprietaire_id);
      const proprietaireResult = await pool.execute(
        'SELECT statut_validation, motif_rejet FROM proprietaires WHERE id = $1',
        [user.proprietaire_id]
      );

      if (proprietaireResult && proprietaireResult[0] && proprietaireResult[0].length > 0) {
        const proprietaire = proprietaireResult[0][0];
        console.log('📋 Statut propriétaire:', proprietaire.statut_validation);
        
        // Bloquer si le compte est rejeté
        if (proprietaire.statut_validation === 'rejete') {
          console.log('🚫 COMPTE REJETÉ - Connexion refusée');
          return res.status(403).json({ 
            error: `Votre compte a été rejeté et désactivé. ${proprietaire.motif_rejet ? 'Motif : ' + proprietaire.motif_rejet : 'Veuillez contacter l\'administrateur.'}`,
            status: 'rejete',
            motif: proprietaire.motif_rejet
          });
        }
      }
    }

    // Générer le token JWT
    const token = jwt.sign(
      { 
        userId: user.id,
        id: user.id, 
        email: user.email, 
        role: user.role,
        locataire_id: user.locataire_id,
        proprietaire_id: user.proprietaire_id,
        agence_id: user.agence_id
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Token généré pour:', email);

    // Récupérer les informations complètes selon le rôle
    let userData = {
      id: user.id,
      email: user.email,
      role: user.role
    };

    // ✅ CORRECTION : Informations pour les agences
    if (user.role === 'agence' && user.agence_id) {
      console.log('🏢 Récupération des infos agence pour ID:', user.agence_id);
      
      const agenceResult = await pool.execute(
        'SELECT nom, code, actif FROM agences WHERE id = $1',
        [user.agence_id]
      );
      
      console.log('📦 Résultat agence:', agenceResult);
      console.log('📦 agenceResult[0]:', agenceResult[0]);
      
      // ✅ CORRECTION : Vérification correcte
      if (agenceResult && agenceResult[0] && agenceResult[0].length > 0) {
        const agence = agenceResult[0][0];
        console.log('✅ Agence trouvée:', agence);
        
        // ✅ IMPORTANT : Assigner TOUTES les propriétés
        userData.agence_id = user.agence_id;
        userData.agence_nom = agence.nom;
        userData.agence_code = agence.code;
        userData.agence_active = agence.actif;
        
        console.log('✅ userData agence assigné:', {
          agence_id: userData.agence_id,
          agence_nom: userData.agence_nom,
          agence_code: userData.agence_code
        });
      } else {
        console.log('⚠️ Agence non trouvée dans la table agences pour ID:', user.agence_id);
        // Même si l'agence n'est pas trouvée, on assigne quand même l'ID
        userData.agence_id = user.agence_id;
        userData.agence_nom = 'Agence non trouvée';
        userData.agence_code = 'N/A';
      }
    }

    // Informations pour les locataires
    if (user.role === 'locataire' && user.locataire_id) {
      const locataireResult = await pool.execute(
        'SELECT nom, prenom, statut_validation FROM locataires WHERE id = $1',
        [user.locataire_id]
      );
      if (locataireResult && locataireResult[0] && locataireResult[0].length > 0) {
        const locataire = locataireResult[0][0];
        userData.locataire_id = user.locataire_id;
        userData.locataire_nom = `${locataire.prenom} ${locataire.nom}`;
        userData.statut_validation = locataire.statut_validation;
      }
    }

    // Informations pour les propriétaires
    if (user.role === 'proprietaire' && user.proprietaire_id) {
      const proprietaireResult = await pool.execute(
        'SELECT nom, prenom, statut_validation FROM proprietaires WHERE id = $1',
        [user.proprietaire_id]
      );
      if (proprietaireResult && proprietaireResult[0] && proprietaireResult[0].length > 0) {
        const proprietaire = proprietaireResult[0][0];
        userData.proprietaire_id = user.proprietaire_id;
        userData.proprietaire_nom = `${proprietaire.prenom} ${proprietaire.nom}`;
        userData.statut_validation = proprietaire.statut_validation;
      }
    }

    console.log('✅ Connexion réussie pour:', email);
    console.log('📤 Données utilisateur FINALES:', { 
      role: userData.role, 
      locataire_id: userData.locataire_id, 
      proprietaire_id: userData.proprietaire_id,
      agence_id: userData.agence_id,
      agence_nom: userData.agence_nom 
    });

    res.json({ 
      token,
      user: userData
    });

  } catch (error) {
    console.error('❌ Erreur login:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
};

// Fonction pour créer automatiquement un compte agence
exports.createAgenceUser = async (agence_id, email, telephone) => {
  try {
    console.log('🏢 Création compte agence:', { agence_id, email, telephone });

    // Vérifier si l'agence existe
    const agenceCheck = await pool.execute(
      'SELECT id, nom FROM agences WHERE id = $1',
      [agence_id]
    );

    if (!agenceCheck || !agenceCheck[0] || agenceCheck[0].length === 0) {
      throw new Error('Agence introuvable');
    }

    // Vérifier si un compte existe déjà pour cette agence
    const existingUser = await pool.execute(
      'SELECT id FROM users WHERE agence_id = $1',
      [agence_id]
    );

    if (existingUser && existingUser[0] && existingUser[0].length > 0) {
      console.log('⚠️ Un compte existe déjà pour cette agence');
      return existingUser[0][0].id;
    }

    // Vérifier si l'email est déjà utilisé
    const emailCheck = await pool.execute(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (emailCheck && emailCheck[0] && emailCheck[0].length > 0) {
      throw new Error('Cet email est déjà utilisé');
    }

    // Hasher le mot de passe (numéro de téléphone)
    const hashedPassword = await bcrypt.hash(telephone, 10);

    // Créer le compte utilisateur
    const result = await pool.execute(
      `INSERT INTO users (email, password, role, agence_id, is_active) 
       VALUES ($1, $2, 'agence', $3, true)
       RETURNING id`,
      [email, hashedPassword, agence_id]
    );

    console.log('✅ Compte agence créé avec succès:', result[0][0].id);
    return result[0][0].id;

  } catch (error) {
    console.error('❌ Erreur création compte agence:', error);
    throw error;
  }
};

// Fonction pour mettre à jour les identifiants d'une agence
exports.updateAgenceCredentials = async (agence_id, email, telephone) => {
  try {
    console.log('🔄 Mise à jour identifiants agence:', { agence_id, email });

    // Vérifier si un compte existe pour cette agence
    const existingUser = await pool.execute(
      'SELECT id, email FROM users WHERE agence_id = $1',
      [agence_id]
    );

    if (!existingUser || !existingUser[0] || existingUser[0].length === 0) {
      console.log('ℹ️ Aucun compte trouvé, création...');
      return await exports.createAgenceUser(agence_id, email, telephone);
    }

    const userId = existingUser[0][0].id;
    const oldEmail = existingUser[0][0].email;

    // Si l'email change, vérifier qu'il n'est pas déjà utilisé
    if (email !== oldEmail) {
      const emailCheck = await pool.execute(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, userId]
      );

      if (emailCheck && emailCheck[0] && emailCheck[0].length > 0) {
        throw new Error('Cet email est déjà utilisé par un autre compte');
      }
    }

    // Hasher le nouveau mot de passe (numéro de téléphone)
    const hashedPassword = await bcrypt.hash(telephone, 10);

    // Mettre à jour l'email et le mot de passe
    await pool.execute(
      'UPDATE users SET email = $1, password = $2 WHERE id = $3',
      [email, hashedPassword, userId]
    );

    console.log('✅ Identifiants agence mis à jour');
    return userId;

  } catch (error) {
    console.error('❌ Erreur mise à jour identifiants agence:', error);
    throw error;
  }
};

// Fonction pour désactiver le compte d'une agence
exports.deactivateAgenceUser = async (agence_id) => {
  try {
    console.log('🔒 Désactivation compte agence:', agence_id);

    await pool.execute(
      'UPDATE users SET is_active = false WHERE agence_id = $1',
      [agence_id]
    );

    console.log('✅ Compte agence désactivé');
  } catch (error) {
    console.error('❌ Erreur désactivation compte agence:', error);
    throw error;
  }
};

// Fonction pour réactiver le compte d'une agence
exports.activateAgenceUser = async (agence_id) => {
  try {
    console.log('🔓 Réactivation compte agence:', agence_id);

    await pool.execute(
      'UPDATE users SET is_active = true WHERE agence_id = $1',
      [agence_id]
    );

    console.log('✅ Compte agence réactivé');
  } catch (error) {
    console.error('❌ Erreur réactivation compte agence:', error);
    throw error;
  }
};

// Fonction pour vérifier le token et récupérer l'utilisateur actuel
exports.getCurrentUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await pool.execute(
      'SELECT id, email, role, locataire_id, proprietaire_id, agence_id, is_active FROM users WHERE id = $1',
      [decoded.userId || decoded.id]
    );

    if (!result || !result[0] || result[0].length === 0) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    const user = result[0][0];

    // 🔒 Vérifier si le compte est actif
    if (user.is_active === false || user.is_active === 0 || user.is_active === 'false' || !user.is_active) {
      console.log('🚫 getCurrentUser: Compte désactivé pour user_id:', user.id);
      return res.status(403).json({ 
        error: 'Votre compte a été désactivé',
        status: 'desactive'
      });
    }

    // 🆕 Vérifier le statut pour les agences
    if (user.role === 'agence' && user.agence_id) {
      const agenceResult = await pool.execute(
        'SELECT actif FROM agences WHERE id = $1',
        [user.agence_id]
      );

      if (agenceResult && agenceResult[0] && agenceResult[0].length > 0) {
        const agence = agenceResult[0][0];
        
        if (!agence.actif) {
          console.log('🚫 getCurrentUser: Agence désactivée pour agence_id:', user.agence_id);
          return res.status(403).json({ 
            error: 'Votre agence a été désactivée',
            status: 'agence_desactivee'
          });
        }
      }
    }

    // 🆕 Vérifier le statut pour les locataires
    if (user.role === 'locataire' && user.locataire_id) {
      const locataireResult = await pool.execute(
        'SELECT statut_validation FROM locataires WHERE id = $1',
        [user.locataire_id]
      );

      if (locataireResult && locataireResult[0] && locataireResult[0].length > 0) {
        const locataire = locataireResult[0][0];
        
        if (locataire.statut_validation === 'rejete') {
          console.log('🚫 getCurrentUser: Compte rejeté pour locataire_id:', user.locataire_id);
          return res.status(403).json({ 
            error: 'Votre compte a été rejeté et désactivé',
            status: 'rejete'
          });
        }
      }
    }

    // 🆕 Vérifier le statut pour les propriétaires
    if (user.role === 'proprietaire' && user.proprietaire_id) {
      const proprietaireResult = await pool.execute(
        'SELECT statut_validation FROM proprietaires WHERE id = $1',
        [user.proprietaire_id]
      );

      if (proprietaireResult && proprietaireResult[0] && proprietaireResult[0].length > 0) {
        const proprietaire = proprietaireResult[0][0];
        
        if (proprietaire.statut_validation === 'rejete') {
          console.log('🚫 getCurrentUser: Compte rejeté pour proprietaire_id:', user.proprietaire_id);
          return res.status(403).json({ 
            error: 'Votre compte a été rejeté et désactivé',
            status: 'rejete'
          });
        }
      }
    }

    // Récupérer les informations complètes
    let userData = {
      id: user.id,
      email: user.email,
      role: user.role
    };

    // ✅ CORRECTION : Informations pour les agences
    if (user.role === 'agence' && user.agence_id) {
      const agenceResult = await pool.execute(
        'SELECT nom, code, actif FROM agences WHERE id = $1',
        [user.agence_id]
      );
      
      if (agenceResult && agenceResult[0] && agenceResult[0].length > 0) {
        const agence = agenceResult[0][0];
        userData.agence_id = user.agence_id;
        userData.agence_nom = agence.nom;
        userData.agence_code = agence.code;
        userData.agence_active = agence.actif;
      } else {
        // Même si l'agence n'est pas trouvée, on assigne l'ID
        userData.agence_id = user.agence_id;
        userData.agence_nom = 'Agence non trouvée';
        userData.agence_code = 'N/A';
      }
    }

    // Informations pour les locataires
    if (user.role === 'locataire' && user.locataire_id) {
      const locataireResult = await pool.execute(
        'SELECT nom, prenom, statut_validation FROM locataires WHERE id = $1',
        [user.locataire_id]
      );
      if (locataireResult && locataireResult[0] && locataireResult[0].length > 0) {
        const locataire = locataireResult[0][0];
        userData.locataire_id = user.locataire_id;
        userData.locataire_nom = `${locataire.prenom} ${locataire.nom}`;
        userData.statut_validation = locataire.statut_validation;
      }
    }

    // Informations pour les propriétaires
    if (user.role === 'proprietaire' && user.proprietaire_id) {
      const proprietaireResult = await pool.execute(
        'SELECT nom, prenom, statut_validation FROM proprietaires WHERE id = $1',
        [user.proprietaire_id]
      );
      if (proprietaireResult && proprietaireResult[0] && proprietaireResult[0].length > 0) {
        const proprietaire = proprietaireResult[0][0];
        userData.proprietaire_id = user.proprietaire_id;
        userData.proprietaire_nom = `${proprietaire.prenom} ${proprietaire.nom}`;
        userData.statut_validation = proprietaire.statut_validation;
      }
    }

    res.json({ user: userData });

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token invalide' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré' });
    }
    console.error('❌ Erreur getCurrentUser:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Fonction de changement de mot de passe
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Ancien et nouveau mot de passe requis' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
    }

    // Récupérer l'utilisateur
    const result = await pool.execute(
      'SELECT password FROM users WHERE id = $1',
      [userId]
    );

    if (!result || !result[0] || result[0].length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const user = result[0][0];

    // Vérifier l'ancien mot de passe
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Mettre à jour le mot de passe
    await pool.execute(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, userId]
    );

    res.json({ message: 'Mot de passe changé avec succès' });

  } catch (error) {
    console.error('❌ Erreur changement mot de passe:', error);
    res.status(500).json({ error: 'Erreur lors du changement de mot de passe' });
  }
};