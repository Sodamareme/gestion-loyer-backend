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

// Fonction pour envoyer l'email d'inscription (en_attente)
const sendInscriptionEmail = async (email, prenom, nom, password) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: '🎉 Bienvenue sur VOSCLES - Vos identifiants',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">🎉 Bienvenue sur VOSCLES !</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937; margin-top: 0;">Bonjour ${prenom} ${nom},</h2>
          
          <p style="color: #4b5563; line-height: 1.6;">
            Merci pour votre inscription sur <strong>VOSCLES</strong> ! Votre compte locataire a été créé avec succès. 🎊
          </p>
          
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0;">
            <p style="color: #92400e; margin: 0;">
              <strong>⏳ Statut :</strong> Votre compte est actuellement <strong>en attente de validation</strong> par notre équipe administrative.
            </p>
          </div>
          
          <p style="color: #4b5563; line-height: 1.6;">
            En attendant la validation, vous pouvez déjà vous connecter à votre espace avec vos identifiants :
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
            Vous recevrez un nouvel email une fois votre compte validé par notre équipe.
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

// Fonction pour envoyer l'email de validation
const sendValidationEmail = async (email, prenom, nom) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: '✅ Compte VOSCLES Validé - Confirmation',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">✅ Compte Validé !</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937; margin-top: 0;">Bonjour ${prenom} ${nom},</h2>
          
          <p style="color: #4b5563; line-height: 1.6;">
            Excellente nouvelle ! Votre compte locataire VOSCLES a été <strong>validé par notre équipe</strong> ! 🎊
          </p>
          
          <div style="background: #d1fae5; padding: 15px; border-radius: 8px; border-left: 4px solid #10b981; margin: 20px 0;">
            <p style="color: #065f46; margin: 0;">
              <strong>✅ Statut :</strong> Votre compte est maintenant <strong>actif</strong> et vous avez accès à toutes les fonctionnalités.
            </p>
          </div>
          
          <p style="color: #4b5563; line-height: 1.6;">
            Vous pouvez maintenant accéder pleinement à votre espace locataire avec vos identifiants.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              Accéder à mon espace
            </a>
          </div>
          
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
    subject: '❌ VOSCLES - Compte Rejeté',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #dc2626; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">❌ Compte Non Validé</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937;">Bonjour ${prenom} ${nom},</h2>
          
          <p style="color: #4b5563; line-height: 1.6;">
            Nous vous remercions pour votre demande d'inscription en tant que locataire sur VOSCLES.
          </p>
          
          <p style="color: #4b5563; line-height: 1.6;">
            Malheureusement, après examen de votre dossier, nous ne pouvons pas valider votre compte.
          </p>
          
          ${motif ? `
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 20px 0;">
              <p style="color: #991b1b; margin: 0;">
                <strong>Motif :</strong> ${motif}
              </p>
            </div>
          ` : ''}
          
          <div style="background: #fff7ed; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0;">
            <p style="color: #92400e; margin: 0;">
              <strong>⚠️ Important :</strong> Vos identifiants de connexion ont été désactivés et ne sont plus valides.
            </p>
          </div>
          
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

// Créer un nouveau locataire (inscription)
exports.createLocataire = async (req, res) => {
  let connection;
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const { nom, prenom, telephone, email, date_naissance, adresse, ville, code_postal, type } = req.body;

    // Validation des champs requis
    if (!nom || !prenom || !email || !date_naissance) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Nom, prénom, email et date de naissance sont requis' 
      });
    }

    // Vérifier si l'email existe déjà
    const [existingEmail] = await connection.execute(
      'SELECT id FROM locataires WHERE email = $1',
      [email]
    );

    if (existingEmail && existingEmail.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    }

    // Générer le mot de passe
    let defaultPassword;
    try {
      defaultPassword = generatePassword(prenom, nom, date_naissance);
    } catch (passwordError) {
      console.error('Erreur génération mot de passe:', passwordError);
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Impossible de générer le mot de passe: ' + passwordError.message 
      });
    }

    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Créer le locataire avec statut "en_attente" et récupérer l'ID
    const [result] = await connection.execute(
      `INSERT INTO locataires 
       (nom, prenom, telephone, email, date_naissance, adresse, ville, code_postal, type, statut_validation, date_inscription) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'en_attente', NOW())
       RETURNING id`,
      [nom, prenom, telephone, email, date_naissance, adresse, ville, code_postal, type || 'particulier']
    );

    const locataireId = result[0].id;

    // Créer le compte utilisateur immédiatement
    await connection.execute(
      'INSERT INTO users (email, password, role, locataire_id, is_active) VALUES ($1, $2, $3, $4, $5)',
      [email, hashedPassword, 'locataire', locataireId, true]
    );

    // Envoyer l'email d'inscription avec les identifiants
    try {
      await sendInscriptionEmail(email, prenom, nom, defaultPassword);
    } catch (emailError) {
      console.error('Erreur envoi email inscription:', emailError);
      // Ne pas bloquer l'inscription si l'email échoue
    }

    await connection.commit();

    return res.status(201).json({ 
      success: true,
      message: 'Inscription réussie ! Un email avec vos identifiants vous a été envoyé. Votre compte est en attente de validation.',
      locataire_id: locataireId
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Erreur création locataire:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Obtenir tous les locataires
exports.getAllLocataires = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        l.*,
        CONCAT(l.prenom, ' ', l.nom) as nom_complet,
        u.email as user_email,
        u.is_active as compte_actif
      FROM locataires l
      LEFT JOIN users u ON u.locataire_id = l.id
      ORDER BY 
        CASE l.statut_validation
          WHEN 'en_attente' THEN 1
          WHEN 'valide' THEN 2
          WHEN 'rejete' THEN 3
        END,
        l.date_inscription DESC
    `);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// Obtenir les locataires en attente
exports.getLocatairesEnAttente = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM locataires 
       WHERE statut_validation = 'en_attente' 
       ORDER BY date_inscription DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// Valider un locataire
exports.validerLocataire = async (req, res) => {
  let connection;
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const { id } = req.params;

    // Récupérer les infos du locataire
    const [locataireRows] = await connection.execute(
      'SELECT * FROM locataires WHERE id = $1',
      [id]
    );

    if (!locataireRows || locataireRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Locataire introuvable' });
    }

    const locataire = locataireRows[0];

    if (locataire.statut_validation === 'valide') {
      await connection.rollback();
      return res.status(400).json({ error: 'Ce locataire est déjà validé' });
    }

    // Mettre à jour le statut du locataire
    await connection.execute(
      `UPDATE locataires 
       SET statut_validation = $1, 
           date_validation = NOW(),
           motif_rejet = NULL
       WHERE id = $2`,
      ['valide', id]
    );

    // S'assurer que le compte utilisateur est actif
    await connection.execute(
      'UPDATE users SET is_active = true WHERE locataire_id = $1',
      [id]
    );

    // Envoyer l'email de confirmation de validation
    try {
      await sendValidationEmail(
        locataire.email, 
        locataire.prenom, 
        locataire.nom
      );
    } catch (emailError) {
      console.error('Erreur envoi email validation:', emailError);
    }

    await connection.commit();

    return res.status(200).json({ 
      success: true,
      message: 'Locataire validé avec succès. Un email de confirmation a été envoyé.'
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Erreur validation locataire:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 🔒 Rejeter un locataire - DÉSACTIVE LE COMPTE UTILISATEUR
exports.rejeterLocataire = async (req, res) => {
  let connection;
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { motif } = req.body;

    // Récupérer les infos du locataire
    const [locataireRows] = await connection.execute(
      'SELECT * FROM locataires WHERE id = $1',
      [id]
    );

    if (!locataireRows || locataireRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Locataire introuvable' });
    }

    const locataire = locataireRows[0];

    // Mettre à jour le statut du locataire
    await connection.execute(
      `UPDATE locataires 
       SET statut_validation = $1, 
           date_validation = NOW(),
           motif_rejet = $2
       WHERE id = $3`,
      ['rejete', motif || 'Non spécifié', id]
    );

    // 🔒 DÉSACTIVER LE COMPTE UTILISATEUR (syntaxe PostgreSQL)
    const [updateResult] = await connection.execute(
      'UPDATE users SET is_active = false WHERE locataire_id = $1',
      [id]
    );

    console.log('Compte désactivé pour locataire_id:', id);

    // Envoyer l'email de rejet
    try {
      await sendRejectionEmail(
        locataire.email,
        locataire.prenom,
        locataire.nom,
        motif
      );
    } catch (emailError) {
      console.error('Erreur envoi email:', emailError);
    }

    await connection.commit();

    return res.status(200).json({ 
      success: true,
      message: 'Locataire rejeté. Le compte utilisateur a été désactivé et un email de notification a été envoyé.' 
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Erreur rejet locataire:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

exports.getLocataireById = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        l.*,
        u.email as user_email,
        u.is_active as compte_actif
      FROM locataires l
      LEFT JOIN users u ON u.locataire_id = l.id
      WHERE l.id = $1
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

exports.updateLocataire = async (req, res) => {
  try {
    const { nom, prenom, telephone, email, type } = req.body;
    await pool.execute(
      'UPDATE locataires SET nom=$1, prenom=$2, telephone=$3, email=$4, type=$5 WHERE id=$6',
      [nom, prenom, telephone, email, type, req.params.id]
    );
    return res.json({ message: 'Locataire mis à jour' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};


// ✅ Récupérer tous les documents du locataire
exports.getMesDocuments = async (req, res) => {
  try {
    const locataire_id = req.user?.locataire_id;
    
    if (!locataire_id) {
      return res.status(403).json({ error: 'Aucun locataire associé à ce compte' });
    }

    console.log('🔍 Récupération documents pour locataire_id:', locataire_id);

    // ✅ Requête adaptée à votre structure
    const query = `
      SELECT 
        d.id,
        d.type,
        d.nom_fichier,
        d.url,
        d.contrat_id,
        d.paiement_id,
        d.mois_concerne,
        d.montant,
        d.created_at as date_creation,
        b.adresse as bien_adresse
      FROM documents d
      INNER JOIN contrats c ON d.contrat_id = c.id
      LEFT JOIN biens b ON c.bien_id = b.id
      WHERE c.locataire_id = $1
      ORDER BY d.created_at DESC
    `;

    const result = await pool.query(query, [locataire_id]);

    console.log('✅ Documents trouvés:', result.rows.length);
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur récupération documents locataire:', error);
    res.status(500).json({ error: error.message });
  }
};

// 📊 Récupérer les statistiques des documents
exports.getStatsDocuments = async (req, res) => {
  try {
    const locataire_id = req.user?.locataire_id;
    
    if (!locataire_id) {
      return res.status(403).json({ error: 'Aucun locataire associé à ce compte' });
    }

    const query = `
      SELECT 
        d.type_document,
        COUNT(*) as nombre,
        MAX(d.date_generation) as dernier_document
      FROM documents d
      INNER JOIN contrats c ON d.contrat_id = c.id
      WHERE c.locataire_id = $1
      GROUP BY d.type_document
      ORDER BY nombre DESC
    `;
    
    const [rows] = await pool.execute(query, [locataire_id]);
    
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération stats documents:', error);
    res.status(500).json({ error: error.message });
  }
};

// 📥 Télécharger un document
exports.downloadDocument = async (req, res) => {
  try {
    const locataire_id = req.user?.locataire_id;
    const document_id = Number(req.params.id);
    
    if (!locataire_id) {
      return res.status(403).json({ error: 'Aucun locataire associé à ce compte' });
    }

    if (!document_id || isNaN(document_id)) {
      return res.status(400).json({ error: 'ID de document invalide' });
    }

    // Vérifier que le document appartient au locataire
    const query = `
      SELECT d.*, c.locataire_id
      FROM documents d
      INNER JOIN contrats c ON d.contrat_id = c.id
      WHERE d.id = $1 AND c.locataire_id = $2
    `;
    
    const [[document]] = await pool.execute(query, [document_id, locataire_id]);

    if (!document) {
      return res.status(404).json({ error: 'Document non trouvé ou non autorisé' });
    }

    // Construire le chemin du fichier
    const filePath = path.join(__dirname, '..', document.chemin_fichier);

    // Vérifier que le fichier existe
    try {
      await fs.access(filePath);
    } catch (err) {
      console.error('❌ Fichier introuvable:', filePath);
      return res.status(404).json({ error: 'Fichier introuvable sur le serveur' });
    }

    // Définir les headers pour le téléchargement
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${document.nom_fichier}"`);

    // Envoyer le fichier
    res.download(filePath, document.nom_fichier, (err) => {
      if (err) {
        console.error('❌ Erreur téléchargement:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Erreur lors du téléchargement' });
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur téléchargement document:', error);
    res.status(500).json({ error: error.message });
  }
};

// 🔍 Récupérer les détails d'un document
exports.getDocumentDetails = async (req, res) => {
  try {
    const locataire_id = req.user?.locataire_id;
    const document_id = Number(req.params.id);
    
    if (!locataire_id) {
      return res.status(403).json({ error: 'Aucun locataire associé à ce compte' });
    }

    if (!document_id || isNaN(document_id)) {
      return res.status(400).json({ error: 'ID de document invalide' });
    }

    // Récupérer les détails du document
    const query = `
      SELECT 
        d.*,
        c.montant_loyer,
        c.date_debut,
        c.date_fin,
        b.adresse as bien_adresse,
        b.type as bien_type,
        l.nom as locataire_nom,
        l.prenom as locataire_prenom
      FROM documents d
      INNER JOIN contrats c ON d.contrat_id = c.id
      INNER JOIN biens b ON c.bien_id = b.id
      INNER JOIN locataires l ON c.locataire_id = l.id
      WHERE d.id = $1 AND c.locataire_id = $2
    `;
    
    const [[document]] = await pool.execute(query, [document_id, locataire_id]);

    if (!document) {
      return res.status(404).json({ error: 'Document non trouvé ou non autorisé' });
    }

    res.json(document);
  } catch (error) {
    console.error('❌ Erreur récupération détails document:', error);
    res.status(500).json({ error: error.message });
  }
};

// 📋 Récupérer les documents par type
exports.getDocumentsByType = async (req, res) => {
  try {
    const locataire_id = req.user?.locataire_id;
    const { type } = req.params;
    
    if (!locataire_id) {
      return res.status(403).json({ error: 'Aucun locataire associé à ce compte' });
    }

    const validTypes = ['quittance', 'avis_echeance', 'contrat', 'quittance_caution', 'autre'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Type de document invalide' });
    }

    const query = `
      SELECT 
        d.*,
        c.montant_loyer,
        b.adresse as bien_adresse
      FROM documents d
      INNER JOIN contrats c ON d.contrat_id = c.id
      INNER JOIN biens b ON c.bien_id = b.id
      WHERE c.locataire_id = $1 AND d.type_document = $2
      ORDER BY d.date_generation DESC
    `;
    
    const [rows] = await pool.execute(query, [locataire_id, type]);
    
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération documents par type:', error);
    res.status(500).json({ error: error.message });
  }
};
exports.getMesContrats = async (req, res) => {
  try {
    const locataire_id = req.user?.locataire_id;
    if (!locataire_id) {
      return res.status(403).json({ error: 'Aucun locataire associé à ce compte' });
    }

    const query = `
      SELECT 
        c.id,
        c.numero_contrat,
        c.date_debut,
        c.date_fin,
        c.montant_loyer,
        c.statut,
        b.adresse AS bien_adresse,
        b.type AS bien_type,
        p.nom AS proprietaire_nom,
        p.telephone AS proprietaire_tel
      FROM contrats c
      INNER JOIN biens b ON c.bien_id = b.id
      INNER JOIN proprietaires p ON b.proprietaire_id = p.id
      WHERE c.locataire_id = $1
      ORDER BY c.date_debut DESC
    `;

    const [rows] = await pool.execute(query, [locataire_id]);
    res.json(rows);

  } catch (error) {
    console.error('❌ Erreur récupération contrats locataire:', error);
    res.status(500).json({ error: error.message });
  }
};

// 🔹 Récupérer le contrat actif du locataire
exports.getMonContrat = async (req, res) => {
  try {
    const locataire_id = req.user?.locataire_id;
    if (!locataire_id) {
      return res.status(403).json({ error: 'Aucun locataire associé à ce compte' });
    }

    const query = `
      SELECT 
        c.id,
        c.numero_contrat,
        c.date_debut,
        c.date_fin,
        c.montant_loyer,
        c.statut,
        b.adresse AS bien_adresse,
        b.type AS bien_type,
        p.nom AS proprietaire_nom,
        p.telephone AS proprietaire_tel
      FROM contrats c
      INNER JOIN biens b ON c.bien_id = b.id
      INNER JOIN proprietaires p ON b.proprietaire_id = p.id
      WHERE c.locataire_id = $1
        AND c.statut = 'actif'
      ORDER BY c.date_debut DESC
      LIMIT 1
    `;

    const [rows] = await pool.execute(query, [locataire_id]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Aucun contrat actif trouvé pour ce locataire' });
    }

    res.json(rows[0]);

  } catch (error) {
    console.error('❌ Erreur récupération contrat actif:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = exports;