const pool = require('../config/db');

const bcrypt = require('bcrypt');

exports.createLocataire = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    let { nom, telephone, email, type } = req.body;

    if (!nom || !telephone || !email) {
      await connection.rollback();
      return res.status(400).json({ error: 'Nom, téléphone et email obligatoires' });
    }

    // Valeurs par défaut
    if (type === undefined) type = 'particulier';

    // 1. Créer le locataire
    const [resultLocataire] = await connection.execute(
      'INSERT INTO locataires (nom, telephone, email, type) VALUES (?, ?, ?, ?)',
      [nom, telephone, email, type]
    );

    const locataireId = resultLocataire.insertId;

    // 2. Créer automatiquement le compte utilisateur
    // Mot de passe par défaut = téléphone (ou autre logique)
    const defaultPassword = telephone.replace(/\s/g, ''); // Enlever les espaces
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    await connection.execute(
      'INSERT INTO users (email, password, role, locataire_id, is_active) VALUES (?, ?, ?, ?, ?)',
      [email, hashedPassword, 'locataire', locataireId, true]
    );

    await connection.commit();

    res.status(201).json({ 
      id: locataireId, 
      message: 'Locataire créé avec succès',
      credentials: {
        email: email,
        password: defaultPassword,
        info: 'Mot de passe par défaut = numéro de téléphone (sans espaces)'
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error(error);
    
    // Gestion des doublons
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }
    
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

exports.updateLocataire = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { nom, telephone, email, type } = req.body;
    const locataireId = req.params.id;
    
    // Récupérer l'ancien email
    const [[oldLocataire]] = await connection.execute(
      'SELECT email FROM locataires WHERE id = ?',
      [locataireId]
    );
    
    if (!oldLocataire) {
      await connection.rollback();
      return res.status(404).json({ error: 'Locataire non trouvé' });
    }

    // Mettre à jour le locataire
    await connection.execute(
      'UPDATE locataires SET nom = ?, telephone = ?, email = ?, type = ? WHERE id = ?',
      [nom, telephone, email, type, locataireId]
    );

    // Si l'email a changé, mettre à jour le compte utilisateur
    if (oldLocataire.email !== email) {
      await connection.execute(
        'UPDATE users SET email = ? WHERE locataire_id = ?',
        [email, locataireId]
      );
    }

    await connection.commit();
    res.json({ message: 'Locataire mis à jour' });

  } catch (error) {
    await connection.rollback();
    console.error(error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }
    
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};



exports.getLocataires = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM locataires ORDER BY nom');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.getLocataireById = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM locataires WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Locataire non trouvé' });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};


