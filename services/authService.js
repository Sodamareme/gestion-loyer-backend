const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

exports.login = async (email, password) => {
  const [users] = await pool.execute(
    `SELECT u.*, l.nom as locataire_nom, l.telephone as locataire_tel
     FROM users u
     LEFT JOIN locataires l ON u.locataire_id = l.id
     WHERE u.email = ? AND u.is_active = TRUE`,
    [email]
  );

  if (!users.length) {
    throw new Error('Email ou mot de passe incorrect');
  }

  const user = users[0];
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new Error('Email ou mot de passe incorrect');
  }

  const token = jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role,
      locataire_id: user.locataire_id 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      locataire_id: user.locataire_id,
      locataire_nom: user.locataire_nom,
      locataire_tel: user.locataire_tel
    }
  };
};

exports.verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Token invalide ou expiré');
  }
};

exports.createLocataireUser = async (locataireId, email, password) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const [result] = await pool.execute(
    'INSERT INTO users (email, password, role, locataire_id) VALUES (?, ?, ?, ?)',
    [email, hashedPassword, 'locataire', locataireId]
  );

  return result.insertId;
};