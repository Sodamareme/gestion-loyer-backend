// À ajouter dans agencePDFController.js ou créer un nouveau fichier agenceEcheancesController.js

const pool = require('../config/db');

// 📊 Récupérer les échéances impayées de l'agence
exports.getEcheancesImpayeesAgence = async (req, res) => {
  try {
    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

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
          AND c.agence_id = $1
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
        WHERE contrat_id IN (
          SELECT id FROM contrats WHERE agence_id = $1
        )
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

    const [rows] = await pool.execute(query, [agence_id]);
    
    console.log('✅ Échéances impayées agence', agence_id, ':', rows.length);
    
    res.json(rows);
  } catch (error) {
    console.error('❌ Erreur récupération échéances impayées agence:', error);
    res.status(500).json({ error: error.message });
  }
};

// 📧 Envoyer un rappel de paiement
exports.envoyerRappelAgence = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const agence_id = req.user?.agence_id;
    
    if (!agence_id) {
      return res.status(403).json({ error: 'Aucune agence associée à ce compte' });
    }

    const { contrat_id, mois_concerne, message } = req.body;

    if (!contrat_id || !mois_concerne) {
      return res.status(400).json({ 
        error: 'Le contrat_id et le mois_concerne sont requis' 
      });
    }

    // Vérifier que le contrat appartient à l'agence
    const [[contrat]] = await connection.execute(
      'SELECT * FROM contrats WHERE id = $1 AND agence_id = $2',
      [contrat_id, agence_id]
    );

    if (!contrat) {
      await connection.rollback();
      return res.status(404).json({ 
        error: 'Contrat introuvable ou non autorisé pour cette agence' 
      });
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
    console.error('❌ Erreur envoi rappel agence:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

module.exports = exports;