const pool = require('../config/db');

exports.createContrat = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const {
      bien_id,
      locataire_id,
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

    // 🔹 Récupérer le type du locataire
    const [[locataire]] = await connection.execute(
      'SELECT type FROM locataires WHERE id = ?',
      [locataire_id]
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
        statut
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'actif')
    `, [
      bien_id,
      locataire_id,
      date_debut,
      date_fin,
      montant_loyer,
      montant_caution || 0,
      jour_paiement,
      charges_structurelles,
      charges_periode,
      montant_eau,
      internetFinal,
      tvaFinal
    ]);

    await connection.execute(
      'UPDATE biens SET statut = "loue" WHERE id = ?',
      [bien_id]
    );

    await connection.commit();

    res.status(201).json({
      id: result.insertId,
      message: 'Contrat créé avec succès'
    });

  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};



exports.getContratsActifs = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM vue_contrats_complets WHERE contrat_statut = "actif"');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
exports.updateContrat = async (req, res) => {
  console.log('PARAMS REÇUS:', req.params);

  const contratId = Number(req.params.id);
  console.log('ID CONVERTI:', contratId);

  if (!contratId || isNaN(contratId)) {
    return res.status(400).json({ error: 'ID de contrat invalide' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

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

    // 🔍 Vérifier que le contrat existe
    const [[contrat]] = await connection.execute(
      `SELECT c.*, l.type AS locataire_type
       FROM contrats c
       LEFT JOIN locataires l ON c.locataire_id = l.id
       WHERE c.id = ?`,
      [contratId]
    );

    if (!contrat) {
      await connection.rollback();
      return res.status(404).json({ error: 'Contrat introuvable' });
    }

    const isCommerce = contrat.locataire_type === 'commerce';

    // 🧩 Construction dynamique
    const updates = [];
    const values = [];

    if (date_fin != null) {
      updates.push('date_fin = ?');
      values.push(date_fin);
    }

    if (montant_loyer != null) {
      updates.push('montant_loyer = ?');
      values.push(montant_loyer);
    }

    if (montant_caution != null) {
      updates.push('montant_caution = ?');
      values.push(montant_caution);
    }

    if (jour_paiement != null) {
      if (jour_paiement < 1 || jour_paiement > 31) {
        throw new Error('Jour de paiement invalide (1–31)');
      }
      updates.push('jour_paiement = ?');
      values.push(jour_paiement);
    }

    if (charges_structurelles != null) {
      updates.push('charges_structurelles = ?');
      values.push(charges_structurelles);
    }

    if (charges_periode != null) {
      updates.push('charges_periode = ?');
      values.push(charges_periode);
    }

    if (montant_eau != null) {
      updates.push('montant_eau = ?');
      values.push(montant_eau);
    }

    // 🔒 Règles métier
    const internetFinal = isCommerce ? 0 : (montant_internet || 0);
    updates.push('montant_internet = ?');
    values.push(internetFinal);

    const tvaFinal = isCommerce ? (tva || 0) : 0;
    updates.push('tva = ?');
    values.push(tvaFinal);

    if (statut != null) {
      const statutsValides = ['actif', 'termine', 'resilie'];
      if (!statutsValides.includes(statut)) {
        throw new Error('Statut invalide');
      }

      updates.push('statut = ?');
      values.push(statut);

      // Libérer le bien si fin de contrat
      if (
        (statut === 'termine' || statut === 'resilie') &&
        contrat.statut === 'actif'
      ) {
        await connection.execute(
          'UPDATE biens SET statut = "disponible" WHERE id = ?',
          [contrat.bien_id]
        );
      }
    }

    if (updates.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Aucun champ à modifier' });
    }

    values.push(contratId);

    await connection.execute(
      `UPDATE contrats SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    await connection.commit();
    res.json({ message: 'Contrat modifié avec succès' });

  } catch (error) {
    await connection.rollback();
    console.error('Erreur modification contrat:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};
exports.archiverContrat = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const contratId = Number(req.params.id);
    
    if (!contratId || isNaN(contratId)) {
      return res.status(400).json({ error: 'ID de contrat invalide' });
    }

    // Vérifier que le contrat existe et n'est pas déjà archivé
    const [[contrat]] = await connection.execute(
      'SELECT * FROM contrats WHERE id = ?',
      [contratId]
    );

    if (!contrat) {
      await connection.rollback();
      return res.status(404).json({ error: 'Contrat introuvable' });
    }

    if (contrat.archive === 1) {
      await connection.rollback();
      return res.status(400).json({ error: 'Ce contrat est déjà archivé' });
    }

    // Archiver le contrat
    await connection.execute(
      `UPDATE contrats 
       SET archive = TRUE, 
           date_archive = NOW(),
           statut = CASE 
             WHEN statut = 'actif' THEN 'termine'
             ELSE statut
           END
       WHERE id = ?`,
      [contratId]
    );

    // Libérer le bien si le contrat était actif
    if (contrat.statut === 'actif') {
      await connection.execute(
        'UPDATE biens SET statut = "disponible" WHERE id = ?',
        [contrat.bien_id]
      );
    }

    await connection.commit();
    res.json({ message: 'Contrat archivé avec succès' });

  } catch (error) {
    await connection.rollback();
    console.error('Erreur archivage contrat:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// Désarchiver un contrat
exports.desarchiverContrat = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const contratId = Number(req.params.id);
    
    if (!contratId || isNaN(contratId)) {
      return res.status(400).json({ error: 'ID de contrat invalide' });
    }

    // Vérifier que le contrat existe et est archivé
    const [[contrat]] = await connection.execute(
      'SELECT * FROM contrats WHERE id = ?',
      [contratId]
    );

    if (!contrat) {
      await connection.rollback();
      return res.status(404).json({ error: 'Contrat introuvable' });
    }

    if (contrat.archive === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Ce contrat n\'est pas archivé' });
    }

    // Désarchiver le contrat
    await connection.execute(
      'UPDATE contrats SET archive = FALSE, date_archive = NULL WHERE id = ?',
      [contratId]
    );

    await connection.commit();
    res.json({ message: 'Contrat désarchivé avec succès' });

  } catch (error) {
    await connection.rollback();
    console.error('Erreur désarchivage contrat:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// Obtenir les contrats archivés
exports.getContratsArchives = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM vue_contrats_complets WHERE archive = TRUE ORDER BY date_archive DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.getContrats = async (req, res) => {
  try {
    const includeArchives = req.query.archives === 'true';
    
    const query = includeArchives
      ? 'SELECT * FROM vue_contrats_complets'
      : 'SELECT * FROM vue_contrats_complets WHERE (archive IS NULL OR archive = FALSE)';
    
    const [rows] = await pool.execute(query);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};