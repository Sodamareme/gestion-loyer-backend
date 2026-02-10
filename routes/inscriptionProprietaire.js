const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../config/db');

// Configuration upload pour carte d'identité (recto et verso)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/cni/');
  },
  filename: (req, file, cb) => {
    // Ajouter recto ou verso dans le nom du fichier
    const side = file.fieldname === 'carte_identite_recto' ? 'recto' : 'verso';
    const uniqueName = `cni-prop-${side}-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'application/pdf';
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Seuls les fichiers JPEG, JPG, PNG ou PDF sont acceptés'));
  }
});

// Route d'inscription propriétaire (EN ATTENTE DE VALIDATION) avec upload recto/verso
router.post('/inscription', upload.fields([
  { name: 'carte_identite_recto', maxCount: 1 },
  { name: 'carte_identite_verso', maxCount: 1 }
]), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      prenom,
      nom,
      date_naissance,
      lieu_naissance,
      numero_cni,
      telephone,
      email,
      adresse
    } = req.body;

    // Validation des champs obligatoires
    if (!prenom || !nom || !date_naissance || !lieu_naissance || !numero_cni || !telephone || !email) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Tous les champs sont obligatoires (prénom, nom, date de naissance, lieu de naissance, numéro CNI, téléphone, email)' 
      });
    }

    // Vérifier si le numéro CNI existe déjà
    const [[existingCNI]] = await connection.execute(
      'SELECT id FROM proprietaires WHERE numero_cni = $1',
      [numero_cni]
    );

    if (existingCNI) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Ce numéro de carte d\'identité est déjà enregistré' 
      });
    }

    // Vérifier si l'email existe déjà
    const [[existingEmail]] = await connection.execute(
      'SELECT id FROM proprietaires WHERE email = $1',
      [email]
    );

    if (existingEmail) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Cet email est déjà utilisé' 
      });
    }

    // Récupérer les fichiers uploadés
    const files = req.files;
    const carte_identite_recto = files && files['carte_identite_recto'] && files['carte_identite_recto'][0] 
      ? files['carte_identite_recto'][0].filename 
      : null;
    const carte_identite_verso = files && files['carte_identite_verso'] && files['carte_identite_verso'][0]
      ? files['carte_identite_verso'][0].filename 
      : null;

    // Vérifier que les deux photos sont présentes
    if (!carte_identite_recto || !carte_identite_verso) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Les deux photos de la carte d\'identité (recto et verso) sont obligatoires' 
      });
    }

    // Créer le propriétaire avec statut EN ATTENTE et les deux fichiers
    await connection.execute(
      `INSERT INTO proprietaires 
       (nom, prenom, date_naissance, lieu_naissance, numero_cni, telephone, email, adresse, carte_identite_recto, carte_identite_verso, statut_validation, date_inscription) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [nom, prenom, date_naissance, lieu_naissance, numero_cni, telephone, email, adresse || null, carte_identite_recto, carte_identite_verso, 'en_attente']
    );

    await connection.commit();

    res.status(201).json({ 
      message: 'Votre demande d\'inscription a été envoyée avec succès !',
      info: 'Votre compte sera activé après validation par un administrateur. Vous recevrez vos identifiants par email une fois votre compte validé.'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Erreur inscription propriétaire:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email ou numéro CNI déjà utilisé' });
    }
    
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

module.exports = router;