// controllers/proprietaireController.js
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

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

// Fonction pour générer le mot de passe
const generatePassword = (prenom, nom, dateNaissance) => {
  if (!prenom || !nom || !dateNaissance) {
    throw new Error('Données manquantes pour générer le mot de passe');
  }

  const initialPrenom = prenom.trim().charAt(0).toUpperCase();
  const nomFamille = nom.trim().toLowerCase();
  
  const date = new Date(dateNaissance);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dateStr = `${day}${month}${year}`;
  
  return `${initialPrenom}${nomFamille}${dateStr}`;
};

// Fonction pour envoyer l'email de validation
const sendValidationEmail = async (email, prenom, nom, password) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: '✅ Compte VOSCLES Validé - Vos identifiants',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">🎉 Compte Validé !</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937; margin-top: 0;">Bonjour ${prenom} ${nom},</h2>
          
          <p style="color: #4b5563; line-height: 1.6;">
            Nous avons le plaisir de vous informer que votre compte propriétaire VOSCLES a été <strong>validé par notre équipe</strong> ! 🎊
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2563eb;">
            <h3 style="margin-top: 0; color: #2563eb;">Vos identifiants de connexion :</h3>
            <p style="margin: 10px 0;"><strong>📧 Email :</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px;">${email}</code></p>
            <p style="margin: 10px 0;"><strong>🔑 Mot de passe :</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px;">${password}</code></p>
          </div>
          
          <div style="background: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 20px 0;">
            <p style="color: #991b1b; margin: 0;">
              <strong>⚠️ Important :</strong> Pour votre sécurité, veuillez changer votre mot de passe lors de votre première connexion.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              Se connecter maintenant
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Vous pouvez maintenant accéder à votre espace propriétaire et commencer à gérer vos biens immobiliers.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} VOSCLES - Gestion Locative Professionnelle<br>
            Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email.
          </p>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// Fonction pour envoyer l'email de rejet
const sendRejectionEmail = async (email, prenom, nom, motif) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'VOSCLES - Demande de compte non validée',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #dc2626; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">Demande non validée</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937;">Bonjour ${prenom} ${nom},</h2>
          
          <p style="color: #4b5563; line-height: 1.6;">
            Nous vous remercions pour votre demande d'inscription en tant que propriétaire sur VOSCLES.
          </p>
          
          <p style="color: #4b5563; line-height: 1.6;">
            Malheureusement, après examen de votre dossier, nous ne pouvons pas valider votre compte pour le moment.
          </p>
          
          ${motif ? `
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 20px 0;">
              <p style="color: #991b1b; margin: 0;">
                <strong>Motif :</strong> ${motif}
              </p>
            </div>
          ` : ''}
          
          <p style="color: #4b5563; line-height: 1.6;">
            Si vous pensez qu'il s'agit d'une erreur ou si vous souhaitez plus d'informations, n'hésitez pas à nous contacter.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} VOSCLES - Gestion Locative Professionnelle
          </p>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

exports.createProprietaire = async (req, res) => {
  try {
    const { nom, telephone, email, adresse } = req.body;
    if (!nom || !telephone) {
      return res.status(400).json({ error: "Nom et téléphone obligatoires" });
    }

    const [result] = await pool.execute(
      'INSERT INTO proprietaires (nom, telephone, email, adresse, statut_validation) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [nom, telephone, email, adresse, 'valide']
    );
    return res.status(201).json({ id: result[0].id, message: 'Propriétaire créé' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

exports.getAllProprietaires = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        p.*,
        CONCAT(p.prenom, ' ', p.nom) as nom_complet,
        u.email as user_email,
        u.is_active as compte_actif
      FROM proprietaires p
      LEFT JOIN users u ON u.proprietaire_id = p.id
      ORDER BY 
        CASE p.statut_validation
          WHEN 'en_attente' THEN 1
          WHEN 'valide' THEN 2
          WHEN 'rejete' THEN 3
        END,
        p.date_inscription DESC
    `);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

exports.getProprietairesEnAttente = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM proprietaires 
       WHERE statut_validation = 'en_attente' 
       ORDER BY date_inscription DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

exports.validerProprietaire = async (req, res) => {
  let connection;
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const { id } = req.params;

    // Récupérer les infos du propriétaire
    const [proprietaireRows] = await connection.execute(
      'SELECT * FROM proprietaires WHERE id = $1',
      [id]
    );

    if (!proprietaireRows || proprietaireRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Propriétaire introuvable' });
    }

    const proprietaire = proprietaireRows[0];

    if (proprietaire.statut_validation === 'valide') {
      await connection.rollback();
      return res.status(400).json({ error: 'Ce propriétaire est déjà validé' });
    }

    if (!proprietaire.prenom || !proprietaire.nom || !proprietaire.date_naissance) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Données incomplètes. Prénom, nom et date de naissance requis.' 
      });
    }

    // Vérifier si un compte utilisateur existe déjà
    const [existingUserRows] = await connection.execute(
      'SELECT id FROM users WHERE email = $1',
      [proprietaire.email]
    );

    if (existingUserRows && existingUserRows.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Un compte utilisateur existe déjà avec cet email' });
    }

    // Générer le mot de passe
    let defaultPassword;
    try {
      defaultPassword = generatePassword(
        proprietaire.prenom, 
        proprietaire.nom,
        proprietaire.date_naissance
      );
    } catch (passwordError) {
      console.error('Erreur génération mot de passe:', passwordError);
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Impossible de générer le mot de passe: ' + passwordError.message 
      });
    }

    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Créer le compte utilisateur
    await connection.execute(
      'INSERT INTO users (email, password, role, proprietaire_id, is_active) VALUES ($1, $2, $3, $4, $5)',
      [proprietaire.email, hashedPassword, 'proprietaire', id, true]
    );

    // Mettre à jour le statut du propriétaire
    await connection.execute(
      `UPDATE proprietaires 
       SET statut_validation = $1, 
           date_validation = NOW()
       WHERE id = $2`,
      ['valide', id]
    );

    // Envoyer l'email avec les identifiants
    try {
      await sendValidationEmail(
        proprietaire.email, 
        proprietaire.prenom, 
        proprietaire.nom,
        defaultPassword
      );
    } catch (emailError) {
      console.error('Erreur envoi email:', emailError);
    }

    await connection.commit();

    return res.status(200).json({ 
      success: true,
      message: 'Propriétaire validé avec succès. Un email a été envoyé avec les identifiants.'
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Erreur validation propriétaire:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 🔧 CORRECTION: Fonction rejeterProprietaire corrigée
exports.rejeterProprietaire = async (req, res) => {
  try {
    const { id } = req.params;
    const { motif } = req.body;

    console.log('Rejet propriétaire:', { id, motif }); // Pour debug

    // Récupérer les infos du propriétaire
    const [proprietaireRows] = await pool.execute(
      'SELECT * FROM proprietaires WHERE id = $1',
      [id]
    );

    if (!proprietaireRows || proprietaireRows.length === 0) {
      return res.status(404).json({ error: 'Propriétaire introuvable' });
    }

    const proprietaire = proprietaireRows[0];

    // Mettre à jour le statut
    await pool.execute(
      `UPDATE proprietaires 
       SET statut_validation = $1, 
           date_validation = NOW(),
           motif_rejet = $2
       WHERE id = $3`,
      ['rejete', motif || 'Non spécifié', id]
    );

    // Envoyer l'email de rejet
    try {
      await sendRejectionEmail(
        proprietaire.email,
        proprietaire.prenom,
        proprietaire.nom,
        motif
      );
    } catch (emailError) {
      console.error('Erreur envoi email:', emailError);
    }

    return res.status(200).json({ 
      success: true,
      message: 'Propriétaire rejeté. Un email de notification a été envoyé.' 
    });

  } catch (error) {
    console.error('Erreur rejet propriétaire:', error);
    return res.status(500).json({ error: error.message });
  }
};

exports.getProprietaireById = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        p.*,
        u.email as user_email,
        u.is_active as compte_actif
      FROM proprietaires p
      LEFT JOIN users u ON u.proprietaire_id = p.id
      WHERE p.id = $1
    `, [req.params.id]);
    
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Non trouvé' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

exports.updateProprietaire = async (req, res) => {
  try {
    const { nom, telephone, email, adresse } = req.body;
    await pool.execute(
      'UPDATE proprietaires SET nom=$1, telephone=$2, email=$3, adresse=$4 WHERE id=$5',
      [nom, telephone, email, adresse, req.params.id]
    );
    return res.json({ message: 'Propriétaire mis à jour' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};