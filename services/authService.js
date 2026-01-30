const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Login
exports.login = async (email, password) => {
  try {
    console.log('🔍 Recherche utilisateur:', email);

    // Récupérer l'utilisateur avec toutes ses informations
    const result = await pool.query(
      `SELECT u.*, 
              l.id as locataire_id, 
              l.nom as locataire_nom,
              p.id as proprietaire_id,
              p.nom as proprietaire_nom
       FROM users u
       LEFT JOIN locataires l ON u.locataire_id = l.id
       LEFT JOIN proprietaires p ON u.proprietaire_id = p.id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Email ou mot de passe incorrect');
    }

    const user = result.rows[0];

    console.log('🔍 Utilisateur trouvé:', {
      id: user.id,
      email: user.email,
      role: user.role,
      locataire_id: user.locataire_id,
      proprietaire_id: user.proprietaire_id
    });

    // Vérifier le mot de passe
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new Error('Email ou mot de passe incorrect');
    }

    // Générer le token JWT
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Token généré pour:', email);

    // Retourner le token et les infos utilisateur
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        locataire_id: user.locataire_id,
        locataire_nom: user.locataire_nom,
        proprietaire_id: user.proprietaire_id,
        proprietaire_nom: user.proprietaire_nom
      }
    };
  } catch (error) {
    console.error('❌ Erreur dans authService.login:', error.message);
    throw error;
  }
};

// Créer un compte pour un locataire
exports.createLocataireUser = async (locataire_id, email, password) => {
  try {
    // Vérifier que le locataire existe
    const locataireCheck = await pool.query(
      'SELECT id FROM locataires WHERE id = $1',
      [locataire_id]
    );

    if (locataireCheck.rows.length === 0) {
      throw new Error('Locataire non trouvé');
    }

    // Vérifier que l'email n'existe pas déjà
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (emailCheck.rows.length > 0) {
      throw new Error('Cet email est déjà utilisé');
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer l'utilisateur
    const result = await pool.query(
      `INSERT INTO users (email, password, role, locataire_id)
       VALUES ($1, $2, 'locataire', $3)
       RETURNING id`,
      [email, hashedPassword, locataire_id]
    );

    console.log('✅ Compte locataire créé:', result.rows[0].id);

    return result.rows[0].id;
  } catch (error) {
    console.error('❌ Erreur createLocataireUser:', error.message);
    throw error;
  }
};

// Créer un compte pour un propriétaire
exports.createProprietaireUser = async (proprietaire_id, email, password) => {
  try {
    // Vérifier que le propriétaire existe
    const proprietaireCheck = await pool.query(
      'SELECT id FROM proprietaires WHERE id = $1',
      [proprietaire_id]
    );

    if (proprietaireCheck.rows.length === 0) {
      throw new Error('Propriétaire non trouvé');
    }

    // Vérifier que l'email n'existe pas déjà
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (emailCheck.rows.length > 0) {
      throw new Error('Cet email est déjà utilisé');
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer l'utilisateur
    const result = await pool.query(
      `INSERT INTO users (email, password, role, proprietaire_id)
       VALUES ($1, $2, 'proprietaire', $3)
       RETURNING id`,
      [email, hashedPassword, proprietaire_id]
    );

    console.log('✅ Compte propriétaire créé:', result.rows[0].id);

    return result.rows[0].id;
  } catch (error) {
    console.error('❌ Erreur createProprietaireUser:', error.message);
    throw error;
  }
};
exports.createAgenceUser = async (agence_id, email, password) => {
  try {
    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.length > 0) {
      throw new Error('Cet email est déjà utilisé');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (email, password, role, agence_id, is_active) 
       VALUES ($1, $2, 'agence', $3, true) 
       RETURNING id`,
      [email, hashedPassword, agence_id]
    );

    return rows[0].id;
  } catch (error) {
    throw error;
  }
};
// Vérifier un token
exports.verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Token invalide');
  }
};
// Fonction de changement d'email
exports.changeEmail = async (req, res) => {
  try {
    const { newEmail, currentPassword } = req.body;
    const userId = req.user.id;

    console.log('📧 Tentative de changement d\'email pour user_id:', userId);

    if (!newEmail || !currentPassword) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Validation de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ error: 'Email invalide' });
    }

    // Récupérer l'utilisateur
    const result = await pool.execute(
      'SELECT email, password FROM users WHERE id = $1',
      [userId]
    );

    if (!result || !result[0] || result[0].length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const user = result[0][0];

    // Vérifier que le nouvel email est différent
    if (user.email === newEmail) {
      return res.status(400).json({ error: 'Le nouvel email est identique à l\'ancien' });
    }

    // Vérifier le mot de passe actuel
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // Vérifier que l'email n'est pas déjà utilisé
    const emailCheck = await pool.execute(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [newEmail, userId]
    );

    if (emailCheck && emailCheck[0] && emailCheck[0].length > 0) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre compte' });
    }

    // Mettre à jour l'email
    await pool.execute(
      'UPDATE users SET email = $1 WHERE id = $2',
      [newEmail, userId]
    );

    console.log('✅ Email changé avec succès:', { userId, oldEmail: user.email, newEmail });

    res.json({ 
      message: 'Email changé avec succès',
      newEmail 
    });

  } catch (error) {
    console.error('❌ Erreur changement email:', error);
    res.status(500).json({ error: 'Erreur lors du changement d\'email' });
  }
};