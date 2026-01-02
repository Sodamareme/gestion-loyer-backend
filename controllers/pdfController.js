const pool = require('../config/db');
const pdfService = require('../services/pdfService');
exports.generateQuittance = async (req, res) => {
  try {
    const [paiements] = await pool.execute(`
      SELECT p.*, 
             c.montant_loyer, 
             c.jour_paiement, 
             c.charges,
             l.nom AS locataire_nom, 
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
      WHERE p.id = ?
    `, [req.params.paiement_id]);

    if (!paiements.length) {
      return res.status(404).json({ error: 'Paiement non trouvé' });
    }

    const paiement = paiements[0];
    const pdf = await pdfService.generateQuittance(paiement);

    // Enregistrer dans la base de données
    await pool.execute(
      'INSERT INTO quittances (paiement_id, numero_quittance, fichier_path) VALUES (?, ?, ?)',
      [req.params.paiement_id, pdf.numeroQuittance, pdf.fileName]
    );

    res.json({ 
      message: 'Quittance générée avec succès', 
      url: `/documents/${pdf.fileName}`,
      numeroQuittance: pdf.numeroQuittance
    });
  } catch (error) {
    console.error('Erreur génération quittance:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.generateAvisEcheance = async (req, res) => {
  try {
    const { mois_concerne } = req.body || {};
    
    if (!mois_concerne) {
      return res.status(400).json({ 
        error: 'Le champ "mois_concerne" est obligatoire (format: YYYY-MM)' 
      });
    }

    const [contrats] = await pool.execute(`
      SELECT c.*, 
             l.nom AS locataire_nom, 
             l.telephone AS locataire_tel,
             l.adresse AS locataire_adresse,
             b.adresse AS bien_adresse,
             b.type AS bien_type,
             pr.nom AS proprietaire_nom, 
             pr.telephone AS proprietaire_tel,
             pr.email AS proprietaire_email,
             pr.adresse AS proprietaire_adresse
      FROM contrats c
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      JOIN proprietaires pr ON b.proprietaire_id = pr.id
      WHERE c.id = ? AND c.statut = 'actif'
    `, [req.params.contrat_id]);

    if (!contrats.length) {
      return res.status(404).json({ error: 'Contrat non trouvé ou inactif' });
    }

    const contrat = contrats[0];
    const pdf = await pdfService.generateAvisEcheance(contrat, mois_concerne);

    // Enregistrer dans la base de données
    const montantDu = Number(contrat.montant_loyer) + Number(contrat.charges || 0);
    await pool.execute(
      'INSERT INTO avis_echeance (contrat_id, mois_concerne, montant_du, fichier_path) VALUES (?, ?, ?, ?)',
      [req.params.contrat_id, mois_concerne, montantDu, pdf.fileName]
    );

    res.json({ 
      message: 'Avis d\'échéance généré avec succès', 
      url: `/documents/${pdf.fileName}`,
      numeroAvis: pdf.numeroAvis
    });
  } catch (error) {
    console.error('Erreur génération avis:', error);
    res.status(500).json({ error: error.message });
  }
};
exports.generateQuittanceCaution = async (req, res) => {
  try {
    const { montant_caution } = req.body || {};
    
    console.log('Génération quittance caution - Contrat ID:', req.params.contrat_id);
    console.log('Montant caution:', montant_caution);
    
    if (!montant_caution || Number(montant_caution) <= 0) {
      return res.status(400).json({ 
        error: 'Le montant de la caution est obligatoire et doit être positif' 
      });
    }

    const [contrats] = await pool.execute(`
      SELECT c.*, 
             c.montant_loyer,
             l.nom AS locataire_nom, 
             l.telephone AS locataire_tel,
             l.adresse AS locataire_adresse,
             b.adresse AS bien_adresse,
             b.type AS bien_type
      FROM contrats c
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      WHERE c.id = ? AND c.statut = 'actif'
    `, [req.params.contrat_id]);

    if (!contrats.length) {
      return res.status(404).json({ error: 'Contrat non trouvé ou inactif' });
    }

    const contrat = contrats[0];
    console.log('Contrat trouvé:', contrat.locataire_nom);
    
    const pdf = await pdfService.generateQuittanceCaution(contrat, Number(montant_caution));

    console.log('PDF généré:', pdf.fileName);

    res.json({ 
      message: 'Quittance de caution générée avec succès', 
      url: `/documents/${pdf.fileName}`,
      numeroQuittance: pdf.numeroQuittance
    });
  } catch (error) {
    console.error('Erreur génération quittance caution:', error);
    res.status(500).json({ error: error.message });
  }
};