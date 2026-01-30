

const pool = require('../config/db');

// 📄 Récupérer tous les documents du locataire (VERSION OPTIMISÉE avec table documents)
exports.getMesDocuments = async (req, res) => {
  try {
    const locataire_id = req.user?.locataire_id;
    
    if (!locataire_id) {
      return res.status(403).json({ error: 'Aucun locataire associé à ce compte' });
    }

    // Requête optimisée avec la table documents
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

    const [documents] = await pool.execute(query, [locataire_id]);

    console.log('✅ Documents locataire', locataire_id, ':', documents.length);
    
    res.json(documents);
  } catch (error) {
    console.error('❌ Erreur récupération documents locataire:', error);
    res.status(500).json({ error: error.message });
  }
};

// 📝 Fonction utilitaire pour enregistrer un document dans la base (à utiliser lors de la génération)
exports.enregistrerDocument = async (type, nomFichier, url, contratId, paiementId, moisConcerne, montant) => {
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

    console.log('✅ Document enregistré:', result[0].id);
    return result[0].id;
  } catch (error) {
    console.error('❌ Erreur enregistrement document:', error);
    throw error;
  }
};

module.exports = exports;