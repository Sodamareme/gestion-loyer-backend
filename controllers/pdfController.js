const pool = require('../config/db');
const pdfService = require('../services/pdfService');

// 🆕 Fonction utilitaire pour enregistrer un document dans la table documents
const enregistrerDocument = async (type, nomFichier, url, contratId, paiementId, moisConcerne, montant) => {
  try {
    const query = `
      INSERT INTO documents (type, nom_fichier, url, contrat_id, paiement_id, mois_concerne, montant)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    const [result] = await pool.execute(query, [
      type,
      nomFichier,
      url,
      contratId,
      paiementId || null,
      moisConcerne || null,
      montant || null
    ]);

    console.log('✅ Document enregistré:', result[0]?.id);
    return result[0]?.id;
  } catch (error) {
    console.error('❌ Erreur enregistrement document:', error);
    // Ne pas bloquer si l'enregistrement échoue
    console.warn('⚠️ Document non enregistré dans la table');
  }
};
exports.generateContratAuto = async (contratId) => {
  const result = await pool.query(`SELECT ... FROM contrats WHERE id = $1`, [contratId]);
  const contrat = result.rows[0];
  
  const pdf = await pdfService.generateContrat(contrat);
  
  // Enregistrer dans documents
  await enregistrerDocument(
    'contrat',
    pdf.fileName,
    `/documents/${pdf.fileName}`,
    contratId,
    null,
    contrat.date_debut,
    null
  );
  
  return { success: true, url: `/documents/${pdf.fileName}` };
};
// 📄 Générer un contrat de location
// 📄 Générer le PDF d'un contrat
exports.generateContrat = async (req, res) => {
  try {
    const contratId = req.params.contrat_id;

    console.log('📄 Génération PDF contrat ID:', contratId);

    // ✅ CORRIGÉ: Utilisation de b.surface (pas superficie)
    const [contrats] = await pool.execute(`
      SELECT 
        c.*,
        c.id as contrat_id,
        l.nom AS locataire_nom,
        l.prenom AS locataire_prenom,
        l.telephone AS locataire_tel,
        l.adresse AS locataire_adresse,
        l.email AS locataire_email,
        b.adresse AS bien_adresse,
        b.numero_bien,
        b.type AS bien_type,
        b.surface AS bien_surface,
        pr.nom AS proprietaire_nom,
        pr.adresse AS proprietaire_adresse,
        pr.telephone AS proprietaire_tel,
        pr.email AS proprietaire_email
      FROM contrats c
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      JOIN proprietaires pr ON b.proprietaire_id = pr.id
      WHERE c.id = $1
    `, [contratId]);

    if (!contrats.length) {
      return res.status(404).json({ error: 'Contrat non trouvé' });
    }

    const contrat = contrats[0];
    console.log('✅ Contrat trouvé:', contrat.locataire_nom, '- Surface:', contrat.bien_surface, 'm²');

    // Générer le PDF via le service
    const pdf = await pdfService.generateContrat(contrat);

    console.log('✅ PDF généré:', pdf.fileName);

    // 🆕 Enregistrer dans la table documents
    await enregistrerDocument(
      'contrat',                           // type
      pdf.fileName,                        // nom_fichier
      `/documents/${pdf.fileName}`,       // url
      contratId,                           // contrat_id
      null,                                // paiement_id (null pour contrats)
      contrat.date_debut,                  // mois_concerne (date de début)
      null                                 // montant (null pour contrats)
    );

    // Mettre à jour le numéro de contrat dans la table contrats
    await pool.execute(
      'UPDATE contrats SET numero_contrat = $1 WHERE id = $2',
      [pdf.numeroContrat, contratId]
    );

    console.log('✅ Contrat enregistré avec numéro:', pdf.numeroContrat);

    res.json({
      success: true,
      message: 'Contrat PDF généré avec succès',
      url: `/documents/${pdf.fileName}`,
      numeroContrat: pdf.numeroContrat,
      fileName: pdf.fileName
    });

  } catch (error) {
    console.error('❌ Erreur génération contrat PDF:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la génération du contrat' 
    });
  }
};
// 📄 Générer une quittance de loyer
exports.generateQuittance = async (req, res) => {
  try {
    const paiementId = req.params.paiement_id;

    const [paiements] = await pool.execute(`
      SELECT p.*, 
             c.id as contrat_id,
             c.montant_loyer, 
             c.jour_paiement, 
             c.charges_periode AS charges,
             l.nom AS locataire_nom, 
             l.prenom AS locataire_prenom,
             l.adresse AS locataire_adresse,
             l.telephone AS locataire_telephone,
             b.adresse AS bien_adresse, 
             b.type AS bien_type,
             pr.nom AS proprietaire_nom, 
             pr.adresse AS proprietaire_adresse,
             pr.telephone AS proprietaire_telephone,
             pr.email AS proprietaire_email
      FROM paiements p
      JOIN contrats c ON p.contrat_id = c.id
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      JOIN proprietaires pr ON b.proprietaire_id = pr.id
      WHERE p.id = $1
    `, [paiementId]);

    if (!paiements.length) {
      return res.status(404).json({ error: 'Paiement non trouvé' });
    }

    const paiement = paiements[0];
    console.log('📄 Génération quittance pour paiement:', paiementId);

    const pdf = await pdfService.generateQuittance(paiement);

    // 🆕 Enregistrer dans la table documents
    await enregistrerDocument(
      'quittance',                          // type
      pdf.fileName,                         // nom_fichier
      `/documents/${pdf.fileName}`,        // url
      paiement.contrat_id,                 // contrat_id
      paiementId,                          // paiement_id
      paiement.mois_concerne,              // mois_concerne
      paiement.montant_paye                // montant
    );

    // Mettre à jour le numéro de quittance dans la table paiements
    await pool.execute(
      'UPDATE paiements SET numero_quittance = $1 WHERE id = $2',
      [pdf.numeroQuittance, paiementId]
    );

    console.log('✅ Quittance générée:', pdf.fileName);

    res.json({ 
      message: 'Quittance générée avec succès', 
      url: `/documents/${pdf.fileName}`,
      numeroQuittance: pdf.numeroQuittance,
      fileName: pdf.fileName
    });
  } catch (error) {
    console.error('❌ Erreur génération quittance:', error);
    res.status(500).json({ error: error.message });
  }
};

// 📅 Générer un avis d'échéance
exports.generateAvisEcheance = async (req, res) => {
  try {
    const contratId = req.params.contrat_id;
    const { mois_concerne } = req.body || {};
    
    if (!mois_concerne) {
      return res.status(400).json({ 
        error: 'Le champ "mois_concerne" est obligatoire (format: YYYY-MM-DD)' 
      });
    }

    const [contrats] = await pool.execute(`
      SELECT c.*, 
             l.nom AS locataire_nom,
             l.prenom AS locataire_prenom, 
             l.telephone AS locataire_tel,
             l.adresse AS locataire_adresse,
             l.email AS locataire_email,
             b.adresse AS bien_adresse,
             b.numero_bien,
             b.type AS bien_type,
             pr.nom AS proprietaire_nom, 
             pr.telephone AS proprietaire_tel,
             pr.email AS proprietaire_email,
             pr.adresse AS proprietaire_adresse
      FROM contrats c
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      JOIN proprietaires pr ON b.proprietaire_id = pr.id
      WHERE c.id = $1 AND c.statut = 'actif'
    `, [contratId]);

    if (!contrats.length) {
      return res.status(404).json({ error: 'Contrat non trouvé ou inactif' });
    }

    const contrat = contrats[0];
    console.log('📄 Génération avis d\'échéance pour contrat:', contratId, 'mois:', mois_concerne);

    const pdf = await pdfService.generateAvisEcheance(contrat, mois_concerne);

    // Calculer le montant total dû
    const montantLoyer = Number(contrat.montant_loyer || 0);
    const chargesStructurelles = Number(contrat.charges_structurelles || 0);
    const chargesPeriode = Number(contrat.charges_periode || 0);
    const montantEau = Number(contrat.montant_eau || 0);
    const montantInternet = Number(contrat.montant_internet || 0);
    const tva = Number(contrat.tva || 0);
    const montantTotal = montantLoyer + chargesStructurelles + chargesPeriode + montantEau + montantInternet + tva;

    // 🆕 Enregistrer dans la table documents
    await enregistrerDocument(
      'avis_echeance',                     // type
      pdf.fileName,                        // nom_fichier
      `/documents/${pdf.fileName}`,       // url
      contratId,                           // contrat_id
      null,                                // paiement_id (null pour avis)
      mois_concerne,                       // mois_concerne
      montantTotal                         // montant
    );

    console.log('✅ Avis d\'échéance généré:', pdf.fileName);

    res.json({ 
      message: 'Avis d\'échéance généré avec succès', 
      url: `/documents/${pdf.fileName}`,
      numeroAvis: pdf.numeroAvis,
      fileName: pdf.fileName
    });
  } catch (error) {
    console.error('❌ Erreur génération avis d\'échéance:', error);
    res.status(500).json({ error: error.message });
  }
};

// 🛡️ Générer une quittance de caution
exports.generateQuittanceCaution = async (req, res) => {
  try {
    const contratId = req.params.contrat_id;
    const { montant_caution } = req.body || {};
    
    console.log('📄 Génération quittance caution - Contrat ID:', contratId);
    console.log('💰 Montant caution:', montant_caution);
    
    if (!montant_caution || Number(montant_caution) <= 0) {
      return res.status(400).json({ 
        error: 'Le montant de la caution est obligatoire et doit être positif' 
      });
    }

    const [contrats] = await pool.execute(`
      SELECT c.*, 
             c.montant_loyer,
             c.date_debut,
             l.nom AS locataire_nom,
             l.prenom AS locataire_prenom, 
             l.telephone AS locataire_tel,
             l.adresse AS locataire_adresse,
             l.email AS locataire_email,
             b.adresse AS bien_adresse,
             b.numero_bien,
             b.type AS bien_type,
             pr.nom AS proprietaire_nom,
             pr.adresse AS proprietaire_adresse,
             pr.telephone AS proprietaire_tel,
             pr.email AS proprietaire_email
      FROM contrats c
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      JOIN proprietaires pr ON b.proprietaire_id = pr.id
      WHERE c.id = $1 AND c.statut = 'actif'
    `, [contratId]);

    if (!contrats.length) {
      return res.status(404).json({ error: 'Contrat non trouvé ou inactif' });
    }

    const contrat = contrats[0];
    console.log('✅ Contrat trouvé:', contrat.locataire_nom);
    
    const pdf = await pdfService.generateQuittanceCaution(contrat, Number(montant_caution));

    console.log('✅ PDF généré:', pdf.fileName);

    // 🆕 Enregistrer dans la table documents
    await enregistrerDocument(
      'quittance_caution',                 // type
      pdf.fileName,                        // nom_fichier
      `/documents/${pdf.fileName}`,       // url
      contratId,                           // contrat_id
      null,                                // paiement_id
      contrat.date_debut,                  // mois_concerne (date de début du contrat)
      Number(montant_caution)              // montant
    );

    res.json({ 
      message: 'Quittance de caution générée avec succès', 
      url: `/documents/${pdf.fileName}`,
      numeroQuittance: pdf.numeroQuittance,
      fileName: pdf.fileName
    });
  } catch (error) {
    console.error('❌ Erreur génération quittance caution:', error);
    res.status(500).json({ error: error.message });
  }
};

// 📊 Récupérer les échéances impayées (pour les notifications)
exports.getEcheancesImpayees = async (req, res) => {
  try {
    const query = `
      WITH mois_actuel AS (
        SELECT DATE_TRUNC('month', CURRENT_DATE) as debut_mois
      ),
      echeances_dues AS (
        SELECT 
          c.id as contrat_id,
          c.locataire_id,
          c.bien_id,
          c.montant_loyer,
          c.charges_structurelles,
          c.charges_periode,
          c.montant_eau,
          c.montant_internet,
          c.tva,
          c.jour_paiement,
          l.nom as locataire_nom,
          l.prenom as locataire_prenom,
          l.telephone,
          l.email,
          b.adresse as bien_adresse,
          b.numero_bien,
          generate_series(
            DATE_TRUNC('month', c.date_debut),
            LEAST(DATE_TRUNC('month', CURRENT_DATE), DATE_TRUNC('month', c.date_fin)),
            '1 month'::interval
          ) as mois_concerne
        FROM contrats c
        LEFT JOIN locataires l ON c.locataire_id = l.id
        LEFT JOIN biens b ON c.bien_id = b.id
        WHERE c.statut = 'actif'
          AND DATE_TRUNC('month', c.date_debut) <= DATE_TRUNC('month', CURRENT_DATE)
      ),
      paiements_effectues AS (
        SELECT 
          contrat_id,
          DATE_TRUNC('month', mois_concerne) as mois_paye
        FROM paiements
        WHERE montant_paye > 0
      ),
      rappels_envoy AS (
        SELECT 
          contrat_id,
          DATE_TRUNC('month', mois_concerne) as mois_rappel,
          rappel_lu,
          rappel_date,
          message as rappel_message
        FROM rappels_loyer
      )
      SELECT DISTINCT
        ed.contrat_id,
        ed.locataire_id,
        CONCAT(ed.locataire_nom, ' ', COALESCE(ed.locataire_prenom, '')) as locataire_nom,
        ed.bien_adresse,
        ed.telephone,
        ed.email,
        DATE_TRUNC('month', ed.mois_concerne) as mois_concerne,
        (ed.montant_loyer + 
         COALESCE(ed.charges_structurelles, 0) + 
         COALESCE(ed.charges_periode, 0) + 
         COALESCE(ed.montant_eau, 0) + 
         COALESCE(ed.montant_internet, 0) + 
         COALESCE(ed.tva, 0)) as montant_du,
        GREATEST(0, EXTRACT(DAY FROM CURRENT_DATE - 
          (DATE_TRUNC('month', ed.mois_concerne) + 
           MAKE_INTERVAL(days => ed.jour_paiement - 1)))) as jours_retard,
        re.rappel_lu,
        CASE WHEN re.mois_rappel IS NOT NULL THEN true ELSE false END as rappel_envoye,
        re.rappel_date,
        re.rappel_message,
        CONCAT(ed.contrat_id, '-', TO_CHAR(ed.mois_concerne, 'YYYY-MM')) as id
      FROM echeances_dues ed
      LEFT JOIN paiements_effectues pe ON 
        pe.contrat_id = ed.contrat_id AND 
        pe.mois_paye = DATE_TRUNC('month', ed.mois_concerne)
      LEFT JOIN rappels_envoy re ON
        re.contrat_id = ed.contrat_id AND
        re.mois_rappel = DATE_TRUNC('month', ed.mois_concerne)
      WHERE pe.contrat_id IS NULL
        AND DATE_TRUNC('month', ed.mois_concerne) <= DATE_TRUNC('month', CURRENT_DATE)
        AND CURRENT_DATE > (DATE_TRUNC('month', ed.mois_concerne) + 
            MAKE_INTERVAL(days => ed.jour_paiement - 1))
      ORDER BY jours_retard DESC, ed.mois_concerne DESC
    `;

    const [rows] = await pool.execute(query);
    
    console.log('✅ Échéances impayées trouvées:', rows.length);
    
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération échéances impayées:', error);
    res.status(500).json({ error: error.message });
  }
};

// 📧 Envoyer un rappel de paiement
exports.envoyerRappel = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { contrat_id, mois_concerne, message } = req.body;

    if (!contrat_id || !mois_concerne) {
      return res.status(400).json({ 
        error: 'Le contrat_id et le mois_concerne sont requis' 
      });
    }

    // Vérifier que le contrat existe
    const [[contrat]] = await connection.execute(
      'SELECT * FROM contrats WHERE id = $1',
      [contrat_id]
    );

    if (!contrat) {
      await connection.rollback();
      return res.status(404).json({ error: 'Contrat introuvable' });
    }

    // Vérifier si un rappel existe déjà pour ce mois
    const [[rappelExistant]] = await connection.execute(
      `SELECT * FROM rappels_loyer 
       WHERE contrat_id = $1 
       AND DATE_TRUNC('month', mois_concerne) = DATE_TRUNC('month', $2::date)`,
      [contrat_id, mois_concerne]
    );

    if (rappelExistant) {
      // Mettre à jour le rappel existant
      await connection.execute(
        `UPDATE rappels_loyer 
         SET rappel_date = CURRENT_TIMESTAMP,
             rappel_lu = false,
             message = $1
         WHERE contrat_id = $2 
         AND DATE_TRUNC('month', mois_concerne) = DATE_TRUNC('month', $3::date)`,
        [message || null, contrat_id, mois_concerne]
      );
    } else {
      // Créer un nouveau rappel
      await connection.execute(
        `INSERT INTO rappels_loyer (contrat_id, mois_concerne, rappel_date, rappel_lu, message)
         VALUES ($1, $2, CURRENT_TIMESTAMP, false, $3)`,
        [contrat_id, mois_concerne, message || null]
      );
    }

    await connection.commit();

    console.log('✅ Rappel envoyé pour contrat:', contrat_id, 'mois:', mois_concerne);

    res.json({ 
      success: true, 
      message: 'Rappel envoyé avec succès' 
    });

  } catch (error) {
    await connection.rollback();
    console.error('❌ Erreur envoi rappel:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

module.exports = exports;