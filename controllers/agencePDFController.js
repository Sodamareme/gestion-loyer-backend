const pool = require('../config/db');
const pdfService = require('../services/pdfService');

// 📄 Générer une quittance de loyer
exports.generateQuittanceAgence = async (req, res) => {
  const paiementId = Number(req.params.paiementId);
  
  if (!paiementId || isNaN(paiementId)) {
    return res.status(400).json({ error: 'ID de paiement invalide' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    // Récupérer les données complètes du paiement avec vérification agence
    const query = `
      SELECT 
        p.*,
        c.id as contrat_id,
        c.locataire_id,
        c.montant_loyer,
        c.charges_structurelles,
        c.charges_periode,
        c.montant_eau,
        c.montant_internet,
        c.tva,
        l.nom as locataire_nom,
        l.prenom as locataire_prenom,
        b.adresse as bien_adresse,
        b.numero_bien,
        prop.nom as proprietaire_nom,
        a.nom as agence_nom,
        a.code as agence_code
      FROM paiements p
      LEFT JOIN contrats c ON p.contrat_id = c.id
      LEFT JOIN locataires l ON c.locataire_id = l.id
      LEFT JOIN biens b ON c.bien_id = b.id
      LEFT JOIN proprietaires prop ON b.proprietaire_id = prop.id
      LEFT JOIN agences a ON c.agence_id = a.id
      WHERE p.id = $1 AND c.agence_id = $2
    `;
    
    const { rows: paiementRows } = await client.query(query, [paiementId, agence_id]);

    if (!paiementRows || paiementRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        error: 'Paiement introuvable ou non autorisé pour cette agence' 
      });
    }

    const paiement = paiementRows[0];

    console.log('📄 Génération quittance pour paiement:', paiementId, 'agence:', agence_id);

    // Générer le PDF
    const result = await pdfService.generateQuittance(paiement);

    console.log('✅ Quittance générée:', result.fileName);

    // ✅ AJOUTER : Sauvegarder dans la table documents
    await client.query(`
      INSERT INTO documents 
      (type, nom_fichier, url, contrat_id, paiement_id, mois_concerne, montant, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      'quittance',
      result.fileName,
      `/documents/${result.fileName}`,
      paiement.contrat_id,
      paiementId,
      paiement.mois_concerne,
      paiement.montant_paye
    ]);

    console.log('✅ Document enregistré dans la base de données');

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Quittance générée avec succès',
      url: `/documents/${result.fileName}`,
      fileName: result.fileName,
      numeroQuittance: result.numeroQuittance
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur génération quittance agence:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la génération de la quittance' 
    });
  } finally {
    client.release();
  }
};

// 📄 Générer un avis d'échéance
exports.generateAvisEcheanceAgence = async (req, res) => {
  const contratId = Number(req.params.contratId);
  
  if (!contratId || isNaN(contratId)) {
    return res.status(400).json({ error: 'ID de contrat invalide' });
  }

  const { mois_concerne } = req.body;

  if (!mois_concerne) {
    return res.status(400).json({ error: 'Le mois concerné est requis' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    // Récupérer les données complètes du contrat avec vérification agence
    const query = `
      SELECT 
        c.*,
        l.nom as locataire_nom,
        l.prenom as locataire_prenom,
        l.telephone as locataire_tel,
        l.email as locataire_email,
        b.adresse as bien_adresse,
        b.numero_bien,
        b.type as bien_type,
        prop.nom as proprietaire_nom,
        a.nom as agence_nom,
        a.code as agence_code
      FROM contrats c
      LEFT JOIN locataires l ON c.locataire_id = l.id
      LEFT JOIN biens b ON c.bien_id = b.id
      LEFT JOIN proprietaires prop ON b.proprietaire_id = prop.id
      LEFT JOIN agences a ON c.agence_id = a.id
      WHERE c.id = $1 AND c.agence_id = $2
    `;
    
    const { rows: contratRows } = await client.query(query, [contratId, agence_id]);

    if (!contratRows || contratRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        error: 'Contrat introuvable ou non autorisé pour cette agence' 
      });
    }

    const contrat = contratRows[0];

    console.log('📄 Génération avis échéance pour contrat:', contratId, 'mois:', mois_concerne);

    // Générer le PDF
    const result = await pdfService.generateAvisEcheance(contrat, mois_concerne);

    console.log('✅ Avis d\'échéance généré:', result.fileName);

    // ✅ AJOUTER : Sauvegarder dans la table documents
    const montantLoyer = Number(contrat.montant_loyer || 0);
    const charges = Number(contrat.charges_structurelles || 0) + Number(contrat.charges_periode || 0);
    const eau = Number(contrat.montant_eau || 0);
    const internet = Number(contrat.montant_internet || 0);
    const tva = Number(contrat.tva || 0);
    const montantTotal = montantLoyer + charges + eau + internet + tva;

    await client.query(`
      INSERT INTO documents 
      (type, nom_fichier, url, contrat_id, mois_concerne, montant, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      'avis_echeance',
      result.fileName,
      `/documents/${result.fileName}`,
      contratId,
      mois_concerne,
      montantTotal
    ]);

    console.log('✅ Document enregistré dans la base de données');

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Avis d\'échéance généré avec succès',
      url: `/documents/${result.fileName}`,
      fileName: result.fileName,
      numeroAvis: result.numeroAvis
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur génération avis échéance agence:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la génération de l\'avis d\'échéance' 
    });
  } finally {
    client.release();
  }
};

// 📄 Générer une quittance de caution
exports.generateQuittanceCautionAgence = async (req, res) => {
  const contratId = Number(req.params.contratId);
  
  if (!contratId || isNaN(contratId)) {
    return res.status(400).json({ error: 'ID de contrat invalide' });
  }

  const { montant_caution } = req.body;

  if (!montant_caution || montant_caution <= 0) {
    return res.status(400).json({ error: 'Le montant de la caution est requis et doit être positif' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    // Récupérer les données complètes du contrat avec vérification agence
    const query = `
      SELECT 
        c.*,
        l.nom as locataire_nom,
        l.prenom as locataire_prenom,
        l.telephone as locataire_tel,
        l.email as locataire_email,
        b.adresse as bien_adresse,
        b.numero_bien,
        b.type as bien_type,
        prop.nom as proprietaire_nom,
        a.nom as agence_nom,
        a.code as agence_code
      FROM contrats c
      LEFT JOIN locataires l ON c.locataire_id = l.id
      LEFT JOIN biens b ON c.bien_id = b.id
      LEFT JOIN proprietaires prop ON b.proprietaire_id = prop.id
      LEFT JOIN agences a ON c.agence_id = a.id
      WHERE c.id = $1 AND c.agence_id = $2
    `;
    
    const { rows: contratRows } = await client.query(query, [contratId, agence_id]);

    if (!contratRows || contratRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        error: 'Contrat introuvable ou non autorisé pour cette agence' 
      });
    }

    const contrat = contratRows[0];

    console.log('📄 Génération quittance caution pour contrat:', contratId, 'montant:', montant_caution);

    // Générer le PDF
    const result = await pdfService.generateQuittanceCaution(contrat, montant_caution);

    console.log('✅ Quittance de caution générée:', result.fileName);

    // ✅ AJOUTER : Sauvegarder dans la table documents
    await client.query(`
      INSERT INTO documents 
      (type, nom_fichier, url, contrat_id, montant, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      'quittance_caution',
      result.fileName,
      `/documents/${result.fileName}`,
      contratId,
      montant_caution
    ]);

    console.log('✅ Document enregistré dans la base de données');

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Quittance de caution générée avec succès',
      url: `/documents/${result.fileName}`,
      fileName: result.fileName,
      numeroQuittance: result.numeroQuittance
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur génération quittance caution agence:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la génération de la quittance de caution' 
    });
  } finally {
    client.release();
  }
};

// 📋 Récupérer les paiements de l'agence
exports.getPaiementsAgence = async (req, res) => {
  try {
    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    const query = `
      SELECT 
        p.*,
        l.nom as locataire_nom,
        l.prenom as locataire_prenom,
        b.adresse as bien_adresse,
        b.numero_bien,
        c.montant_loyer
      FROM paiements p
      LEFT JOIN contrats c ON p.contrat_id = c.id
      LEFT JOIN locataires l ON c.locataire_id = l.id
      LEFT JOIN biens b ON c.bien_id = b.id
      WHERE c.agence_id = $1
      ORDER BY p.date_paiement DESC, p.mois_concerne DESC
    `;
    
    const { rows } = await pool.query(query, [agence_id]);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération paiements agence:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = exports;