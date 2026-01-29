const pool = require('../config/db');
const pdfService = require('../services/pdfService');

// 📄 Générer une quittance de loyer
exports.generateQuittanceAgence = async (req, res) => {
  const paiementId = Number(req.params.paiementId);
  
  if (!paiementId || isNaN(paiementId)) {
    return res.status(400).json({ error: 'ID de paiement invalide' });
  }

  try {
    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    // Récupérer les données complètes du paiement avec vérification agence
    const query = `
      SELECT 
        p.*,
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
    
    const [[paiement]] = await pool.execute(query, [paiementId, agence_id]);

    if (!paiement) {
      return res.status(404).json({ 
        error: 'Paiement introuvable ou non autorisé pour cette agence' 
      });
    }

    console.log('📄 Génération quittance pour paiement:', paiementId, 'agence:', agence_id);

    // Générer le PDF
    const result = await pdfService.generateQuittance(paiement);

    console.log('✅ Quittance générée:', result.fileName);

    res.json({
      success: true,
      message: 'Quittance générée avec succès',
      url: `/documents/${result.fileName}`,
      fileName: result.fileName,
      numeroQuittance: result.numeroQuittance
    });

  } catch (error) {
    console.error('❌ Erreur génération quittance agence:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la génération de la quittance' 
    });
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

  try {
    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
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
    
    const [[contrat]] = await pool.execute(query, [contratId, agence_id]);

    if (!contrat) {
      return res.status(404).json({ 
        error: 'Contrat introuvable ou non autorisé pour cette agence' 
      });
    }

    console.log('📄 Génération avis échéance pour contrat:', contratId, 'mois:', mois_concerne);

    // Générer le PDF
    const result = await pdfService.generateAvisEcheance(contrat, mois_concerne);

    console.log('✅ Avis d\'échéance généré:', result.fileName);

    res.json({
      success: true,
      message: 'Avis d\'échéance généré avec succès',
      url: `/documents/${result.fileName}`,
      fileName: result.fileName,
      numeroAvis: result.numeroAvis
    });

  } catch (error) {
    console.error('❌ Erreur génération avis échéance agence:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la génération de l\'avis d\'échéance' 
    });
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

  try {
    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
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
    
    const [[contrat]] = await pool.execute(query, [contratId, agence_id]);

    if (!contrat) {
      return res.status(404).json({ 
        error: 'Contrat introuvable ou non autorisé pour cette agence' 
      });
    }

    console.log('📄 Génération quittance caution pour contrat:', contratId, 'montant:', montant_caution);

    // Générer le PDF
    const result = await pdfService.generateQuittanceCaution(contrat, montant_caution);

    console.log('✅ Quittance de caution générée:', result.fileName);

    res.json({
      success: true,
      message: 'Quittance de caution générée avec succès',
      url: `/documents/${result.fileName}`,
      fileName: result.fileName,
      numeroQuittance: result.numeroQuittance
    });

  } catch (error) {
    console.error('❌ Erreur génération quittance caution agence:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la génération de la quittance de caution' 
    });
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
    
    const [rows] = await pool.execute(query, [agence_id]);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération paiements agence:', error);
    res.status(500).json({ error: error.message });
  }
};


module.exports = exports;