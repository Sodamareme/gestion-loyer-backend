const pool = require('../config/db');
const bcrypt = require('bcrypt');
const pdfService = require('../services/pdfService');
const path = require('path');

// 🆕 Créer un contrat (avec option nouveau locataire)
exports.createContratAgence = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      throw new Error('Aucune agence associée à ce compte');
    }

    const {
      bien_id,
      locataire_id, // Si existant
      // Nouvelles données locataire
      locataire_nom,
      locataire_prenom,
      locataire_telephone,
      locataire_email,
      locataire_type,
      locataire_adresse,
      // Données contrat
      date_debut,
      date_fin,
      montant_loyer,
      montant_caution,
      jour_paiement,
      charges_structurelles = 0,
      charges_periode = 0,
      montant_eau = 0,
      montant_internet = 0,
      tva = 0
    } = req.body;

    let finalLocataireId = locataire_id;

    // 🆕 Si pas de locataire_id, créer un nouveau locataire
    if (!locataire_id && locataire_nom && locataire_telephone && locataire_email) {
      console.log('🆕 Création d\'un nouveau locataire par agence:', agence_id);

      // Vérifier si l'email existe déjà
      const [[existingEmail]] = await connection.execute(
        'SELECT id FROM locataires WHERE email = $1',
        [locataire_email]
      );

      if (existingEmail) {
        throw new Error('Un locataire avec cet email existe déjà');
      }

      // Vérifier si le téléphone existe déjà
      const [[existingPhone]] = await connection.execute(
        'SELECT id FROM locataires WHERE telephone = $1',
        [locataire_telephone]
      );

      if (existingPhone) {
        throw new Error('Un locataire avec ce téléphone existe déjà');
      }

      // Créer le locataire avec statut validé automatiquement
      const [locataireResult] = await connection.execute(
        `INSERT INTO locataires 
         (nom, prenom, telephone, email, type, adresse, statut_validation, date_validation, agence_id) 
         VALUES ($1, $2, $3, $4, $5, $6, 'valide', NOW(), $7)
         RETURNING id`,
        [
          locataire_nom,
          locataire_prenom || null,
          locataire_telephone,
          locataire_email,
          locataire_type || 'particulier',
          locataire_adresse || null,
          agence_id
        ]
      );

      finalLocataireId = locataireResult[0].id;
      console.log('✅ Nouveau locataire créé avec ID:', finalLocataireId);

      // Créer le compte utilisateur pour le locataire
      const hashedPassword = await bcrypt.hash(locataire_telephone.replace(/\s/g, ''), 10);
      
      await connection.execute(
        `INSERT INTO users (email, password, role, locataire_id, is_active) 
         VALUES ($1, $2, 'locataire', $3, true)`,
        [locataire_email, hashedPassword, finalLocataireId]
      );

      console.log('✅ Compte utilisateur créé pour le locataire');
    }

    if (!finalLocataireId) {
      throw new Error('Aucun locataire sélectionné ou créé');
    }

    // Vérifier que le bien appartient à l'agence
    const [[bien]] = await connection.execute(
      'SELECT agence_id FROM biens WHERE id = $1',
      [bien_id]
    );

    if (!bien || bien.agence_id !== agence_id) {
      throw new Error('Ce bien n\'appartient pas à votre agence');
    }

    // 🔹 Récupérer le type du locataire
    const [[locataire]] = await connection.execute(
      'SELECT type FROM locataires WHERE id = $1',
      [finalLocataireId]
    );

    if (!locataire) {
      throw new Error('Locataire introuvable');
    }

    const isCommerce = locataire.type === 'commerce';

    // 🔒 Règles métier
    const internetFinal = isCommerce ? 0 : montant_internet;
    const tvaFinal = isCommerce ? tva : 0;

    const [result] = await connection.execute(`
      INSERT INTO contrats (
        bien_id, locataire_id, date_debut, date_fin,
        montant_loyer, montant_caution, jour_paiement,
        charges_structurelles, charges_periode,
        montant_eau, montant_internet, tva,
        statut, agence_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'actif', $13)
      RETURNING id
    `, [
      bien_id,
      finalLocataireId,
      date_debut,
      date_fin,
      montant_loyer,
      montant_caution || 0,
      jour_paiement,
      charges_structurelles,
      charges_periode,
      montant_eau,
      internetFinal,
      tvaFinal,
      agence_id
    ]);

    await connection.execute(
      'UPDATE biens SET statut = $1 WHERE id = $2',
      ['loue', bien_id]
    );

    await connection.commit();

    res.status(201).json({
      id: result[0].id,
      locataire_id: finalLocataireId,
      message: locataire_id ? 'Contrat créé avec succès' : 'Contrat et locataire créés avec succès',
      nouveau_locataire: !locataire_id,
      credentials: !locataire_id ? {
        email: locataire_email,
        password: locataire_telephone.replace(/\s/g, ''),
        info: 'Identifiants du nouveau locataire'
      } : null
    });

  } catch (error) {
    await connection.rollback();
    console.error('❌ Erreur création contrat agence:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// 📋 Récupérer les contrats de l'agence
exports.getContratsAgence = async (req, res) => {
  try {
    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    const includeArchives = req.query.archives === 'true';
    
    let query = `
      SELECT 
        c.*,
        l.nom as locataire_nom,
        l.prenom as locataire_prenom,
        l.telephone as locataire_tel,
        l.email as locataire_email,
        l.type as locataire_type,
        b.numero_bien as bien_numero,
        b.adresse as bien_adresse,
        b.type as bien_type,
        p.nom as proprietaire_nom,
        a.nom as agence_nom,
        a.code as agence_code
      FROM contrats c
      LEFT JOIN locataires l ON c.locataire_id = l.id
      LEFT JOIN biens b ON c.bien_id = b.id
      LEFT JOIN proprietaires p ON b.proprietaire_id = p.id
      LEFT JOIN agences a ON c.agence_id = a.id
      WHERE c.agence_id = $1
    `;
    
    if (!includeArchives) {
      query += ' AND (c.archive IS NULL OR c.archive = FALSE)';
    }
    
    query += ' ORDER BY c.date_debut DESC';
    
    const [rows] = await pool.execute(query, [agence_id]);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération contrats agence:', error);
    res.status(500).json({ error: error.message });
  }
};

// 📋 Récupérer les contrats actifs de l'agence
exports.getContratsActifsAgence = async (req, res) => {
  try {
    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    const query = `
      SELECT 
        c.*,
        l.nom as locataire_nom,
        l.prenom as locataire_prenom,
        l.telephone as locataire_tel,
        l.email as locataire_email,
        l.type as locataire_type,
        b.numero_bien as bien_numero,
        b.adresse as bien_adresse,
        b.type as bien_type,
        p.nom as proprietaire_nom,
        a.nom as agence_nom,
        a.code as agence_code
      FROM contrats c
      LEFT JOIN locataires l ON c.locataire_id = l.id
      LEFT JOIN biens b ON c.bien_id = b.id
      LEFT JOIN proprietaires p ON b.proprietaire_id = p.id
      LEFT JOIN agences a ON c.agence_id = a.id
      WHERE c.agence_id = $1 AND c.statut = $2
      ORDER BY c.date_debut DESC
    `;
    
    const [rows] = await pool.execute(query, [agence_id, 'actif']);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération contrats actifs:', error);
    res.status(500).json({ error: error.message });
  }
};

// 📋 Récupérer les contrats archivés de l'agence
exports.getContratsArchivesAgence = async (req, res) => {
  try {
    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    const query = `
      SELECT 
        c.*,
        l.nom as locataire_nom,
        l.prenom as locataire_prenom,
        l.telephone as locataire_tel,
        l.email as locataire_email,
        l.type as locataire_type,
        b.numero_bien as bien_numero,
        b.adresse as bien_adresse,
        b.type as bien_type,
        p.nom as proprietaire_nom,
        a.nom as agence_nom,
        a.code as agence_code
      FROM contrats c
      LEFT JOIN locataires l ON c.locataire_id = l.id
      LEFT JOIN biens b ON c.bien_id = b.id
      LEFT JOIN proprietaires p ON b.proprietaire_id = p.id
      LEFT JOIN agences a ON c.agence_id = a.id
      WHERE c.agence_id = $1 AND c.archive = TRUE
      ORDER BY c.date_archive DESC
    `;
    
    const [rows] = await pool.execute(query, [agence_id]);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération contrats archivés:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✏️ Modifier un contrat de l'agence
exports.updateContratAgence = async (req, res) => {
  const contratId = Number(req.params.id);
  
  if (!contratId || isNaN(contratId)) {
    return res.status(400).json({ error: 'ID de contrat invalide' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      throw new Error('Aucune agence associée à ce compte');
    }

    const {
      date_fin,
      montant_loyer,
      montant_caution,
      jour_paiement,
      charges_structurelles,
      charges_periode,
      montant_eau,
      montant_internet,
      tva,
      statut
    } = req.body;

    // Vérifier que le contrat existe et appartient à l'agence
    const [[contrat]] = await connection.execute(
      `SELECT c.*, l.type AS locataire_type
       FROM contrats c
       LEFT JOIN locataires l ON c.locataire_id = l.id
       WHERE c.id = $1 AND c.agence_id = $2`,
      [contratId, agence_id]
    );

    if (!contrat) {
      await connection.rollback();
      return res.status(404).json({ error: 'Contrat introuvable ou non autorisé' });
    }

    const isCommerce = contrat.locataire_type === 'commerce';

    // Construction dynamique de la requête
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (date_fin != null) {
      updates.push(`date_fin = $${paramIndex++}`);
      values.push(date_fin);
    }

    if (montant_loyer != null) {
      updates.push(`montant_loyer = $${paramIndex++}`);
      values.push(montant_loyer);
    }

    if (montant_caution != null) {
      updates.push(`montant_caution = $${paramIndex++}`);
      values.push(montant_caution);
    }

    if (jour_paiement != null) {
      if (jour_paiement < 1 || jour_paiement > 31) {
        throw new Error('Jour de paiement invalide (1–31)');
      }
      updates.push(`jour_paiement = $${paramIndex++}`);
      values.push(jour_paiement);
    }

    if (charges_structurelles != null) {
      updates.push(`charges_structurelles = $${paramIndex++}`);
      values.push(charges_structurelles);
    }

    if (charges_periode != null) {
      updates.push(`charges_periode = $${paramIndex++}`);
      values.push(charges_periode);
    }

    if (montant_eau != null) {
      updates.push(`montant_eau = $${paramIndex++}`);
      values.push(montant_eau);
    }

    // Règles métier
    const internetFinal = isCommerce ? 0 : (montant_internet || 0);
    updates.push(`montant_internet = $${paramIndex++}`);
    values.push(internetFinal);

    const tvaFinal = isCommerce ? (tva || 0) : 0;
    updates.push(`tva = $${paramIndex++}`);
    values.push(tvaFinal);

    if (statut != null) {
      const statutsValides = ['actif', 'termine', 'resilie'];
      if (!statutsValides.includes(statut)) {
        throw new Error('Statut invalide');
      }

      updates.push(`statut = $${paramIndex++}`);
      values.push(statut);

      // Libérer le bien si fin de contrat
      if (
        (statut === 'termine' || statut === 'resilie') &&
        contrat.statut === 'actif'
      ) {
        await connection.execute(
          'UPDATE biens SET statut = $1 WHERE id = $2',
          ['disponible', contrat.bien_id]
        );
      }
    }

    if (updates.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Aucun champ à modifier' });
    }

    values.push(contratId);

    await connection.execute(
      `UPDATE contrats SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    await connection.commit();
    res.json({ message: 'Contrat modifié avec succès' });

  } catch (error) {
    await connection.rollback();
    console.error('❌ Erreur modification contrat agence:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// 📦 Archiver un contrat de l'agence
exports.archiverContratAgence = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const agence_id = req.user?.agence_id;
    const contratId = Number(req.params.id);
    
    if (!agence_id) {
      throw new Error('Aucune agence associée à ce compte');
    }
    
    if (!contratId || isNaN(contratId)) {
      return res.status(400).json({ error: 'ID de contrat invalide' });
    }

    // Vérifier que le contrat existe et appartient à l'agence
    const [[contrat]] = await connection.execute(
      'SELECT * FROM contrats WHERE id = $1 AND agence_id = $2',
      [contratId, agence_id]
    );

    if (!contrat) {
      await connection.rollback();
      return res.status(404).json({ error: 'Contrat introuvable ou non autorisé' });
    }

    if (contrat.archive === true) {
      await connection.rollback();
      return res.status(400).json({ error: 'Ce contrat est déjà archivé' });
    }

    await connection.execute(
      `UPDATE contrats 
       SET archive = TRUE, 
           date_archive = CURRENT_TIMESTAMP,
           statut = CASE 
             WHEN statut = 'actif' THEN 'termine'
             ELSE statut
           END
       WHERE id = $1`,
      [contratId]
    );

    if (contrat.statut === 'actif') {
      await connection.execute(
        'UPDATE biens SET statut = $1 WHERE id = $2',
        ['disponible', contrat.bien_id]
      );
    }

    await connection.commit();
    res.json({ message: 'Contrat archivé avec succès' });

  } catch (error) {
    await connection.rollback();
    console.error('❌ Erreur archivage contrat agence:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// 🔄 Désarchiver un contrat de l'agence
exports.desarchiverContratAgence = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const agence_id = req.user?.agence_id;
    const contratId = Number(req.params.id);
    
    if (!agence_id) {
      throw new Error('Aucune agence associée à ce compte');
    }
    
    if (!contratId || isNaN(contratId)) {
      return res.status(400).json({ error: 'ID de contrat invalide' });
    }

    // Vérifier que le contrat existe et appartient à l'agence
    const [[contrat]] = await connection.execute(
      'SELECT * FROM contrats WHERE id = $1 AND agence_id = $2',
      [contratId, agence_id]
    );

    if (!contrat) {
      await connection.rollback();
      return res.status(404).json({ error: 'Contrat introuvable ou non autorisé' });
    }

    if (contrat.archive === false) {
      await connection.rollback();
      return res.status(400).json({ error: 'Ce contrat n\'est pas archivé' });
    }

    await connection.execute(
      'UPDATE contrats SET archive = FALSE, date_archive = NULL WHERE id = $1',
      [contratId]
    );

    await connection.commit();
    res.json({ message: 'Contrat désarchivé avec succès' });

  } catch (error) {
    await connection.rollback();
    console.error('❌ Erreur désarchivage contrat agence:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// 👥 Récupérer les locataires de l'agence
exports.getLocatairesAgence = async (req, res) => {
  try {
    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    const [rows] = await pool.execute(
      `SELECT * FROM locataires 
       WHERE agence_id = $1 AND statut_validation = 'valide' 
       ORDER BY nom`,
      [agence_id]
    );
    
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération locataires agence:', error);
    res.status(500).json({ error: error.message });
  }
};

// 📄 Télécharger le PDF d'un contrat
exports.downloadContratPDF = async (req, res) => {
  const contratId = Number(req.params.id);
  
  if (!contratId || isNaN(contratId)) {
    return res.status(400).json({ error: 'ID de contrat invalide' });
  }

  try {
    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    // Récupérer les données du contrat avec toutes les infos nécessaires
    const query = `
      SELECT 
        c.*,
        l.nom as locataire_nom,
        l.prenom as locataire_prenom,
        l.telephone as locataire_tel,
        l.email as locataire_email,
        l.type as locataire_type,
        b.numero_bien as bien_numero,
        b.adresse as bien_adresse,
        b.type as bien_type,
        p.nom as proprietaire_nom,
        p.prenom as proprietaire_prenom,
        p.telephone as proprietaire_tel,
        a.nom as agence_nom,
        a.code as agence_code
      FROM contrats c
      LEFT JOIN locataires l ON c.locataire_id = l.id
      LEFT JOIN biens b ON c.bien_id = b.id
      LEFT JOIN proprietaires p ON b.proprietaire_id = p.id
      LEFT JOIN agences a ON c.agence_id = a.id
      WHERE c.id = $1 AND c.agence_id = $2
    `;
    
    const [[contrat]] = await pool.execute(query, [contratId, agence_id]);

    if (!contrat) {
      return res.status(404).json({ error: 'Contrat introuvable ou non autorisé' });
    }

    console.log('📄 Génération PDF pour contrat:', contratId);

    // Générer le PDF
    const result = await pdfService.generateContrat(contrat);

    console.log('✅ PDF généré:', result.fileName);

    // Définir les headers pour le téléchargement
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);

    // Envoyer le fichier
    res.download(result.filePath, result.fileName, (err) => {
      if (err) {
        console.error('❌ Erreur téléchargement:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Erreur lors du téléchargement' });
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur génération PDF contrat:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = exports;