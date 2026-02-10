const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const nodemailer = require('nodemailer');

// Configuration upload pour carte d'identité (recto et verso)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/cni/');
  },
  filename: (req, file, cb) => {
    // Ajouter recto ou verso dans le nom du fichier
    const side = file.fieldname === 'carte_identite_recto' ? 'recto' : 'verso';
    const uniqueName = `cni-loc-${side}-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
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

// Configuration email
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Fonction pour générer le mot de passe (même logique que propriétaire)
const generatePassword = (prenom, nom, dateNaissance) => {
  const initialPrenom = prenom.charAt(0).toUpperCase();
  const nomLower = nom.toLowerCase();
  const date = new Date(dateNaissance);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dateStr = `${day}${month}${year}`;
  
  return `${initialPrenom}${nomLower}${dateStr}`;
};

// Fonction pour envoyer l'email
const sendCredentialsEmail = async (email, prenom, nom, password) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Vos identifiants de connexion - VOSCLES Locataire',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Bienvenue sur VOSCLES</h2>
        <p>Bonjour ${prenom} ${nom},</p>
        <p>Votre compte locataire a été créé avec succès. Voici vos identifiants de connexion :</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Email :</strong> ${email}</p>
          <p style="margin: 5px 0;"><strong>Mot de passe :</strong> ${password}</p>
        </div>
        <p style="color: #dc2626;"><strong>Important :</strong> Veuillez changer votre mot de passe après votre première connexion.</p>
        <p>Cordialement,<br>L'équipe VOSCLES</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// Route d'inscription locataire avec upload recto/verso
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
      type  // 'particulier' ou 'entreprise'
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
      'SELECT id FROM locataires WHERE numero_cni = $1',
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
      'SELECT id FROM locataires WHERE email = $1',
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

    // Insérer dans la base de données avec les deux fichiers
    const [resultLocataire] = await connection.execute(
      `INSERT INTO locataires 
       (nom, prenom, date_naissance, lieu_naissance, numero_cni, telephone, email, type, carte_identite_recto, carte_identite_verso) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING id`,
      [nom, prenom, date_naissance, lieu_naissance, numero_cni, telephone, email, type || 'particulier', carte_identite_recto, carte_identite_verso]
    );

    const locataireId = resultLocataire[0].id;

    // Générer le mot de passe
    const defaultPassword = generatePassword(prenom, nom, date_naissance);
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Créer le compte utilisateur
    await connection.execute(
      'INSERT INTO users (email, password, role, locataire_id, is_active) VALUES ($1, $2, $3, $4, $5)',
      [email, hashedPassword, 'locataire', locataireId, true]
    );

    // Envoyer l'email avec les identifiants
    try {
      await sendCredentialsEmail(email, prenom, nom, defaultPassword);
    } catch (emailError) {
      console.error('Erreur envoi email:', emailError);
      // On continue même si l'email échoue
    }

    await connection.commit();

    res.status(201).json({ 
      message: 'Inscription réussie ! Vos identifiants ont été envoyés par email.',
      info: 'Veuillez vérifier votre boîte mail pour récupérer vos identifiants de connexion.'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Erreur inscription locataire:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email ou numéro CNI déjà utilisé' });
    }
    
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

module.exports = router;