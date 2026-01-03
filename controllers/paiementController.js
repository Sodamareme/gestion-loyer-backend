const pool = require('../config/db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

exports.createPaiement = async (req, res) => {
  try {
    const { contrat_id, date_paiement, montant_paye, mode_paiement, reference, mois_concerne } = req.body;

    if (!contrat_id || !date_paiement || !montant_paye || !mode_paiement || !mois_concerne) {
      return res.status(400).json({ 
        error: 'Champs obligatoires manquants',
        details: {
          contrat_id: !!contrat_id,
          date_paiement: !!date_paiement,
          montant_paye: !!montant_paye,
          mode_paiement: !!mode_paiement,
          mois_concerne: !!mois_concerne
        }
      });
    }

    const [result] = await pool.execute(
      'INSERT INTO paiements (contrat_id, date_paiement, montant_paye, mode_paiement, reference, mois_concerne) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [contrat_id, date_paiement, montant_paye, mode_paiement, reference || null, mois_concerne]
    );

    res.status(201).json({ id: result[0].id, message: 'Paiement enregistré avec succès' });
  } catch (error) {
    console.error('Erreur création paiement:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getPaiements = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT p.*, c.montant_loyer, l.nom AS locataire_nom, b.adresse AS bien_adresse
      FROM paiements p
      JOIN contrats c ON p.contrat_id = c.id
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      ORDER BY p.date_paiement DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.getPaiementsByContrat = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM paiements WHERE contrat_id = $1 ORDER BY date_paiement DESC',
      [req.params.contrat_id]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.updatePaiement = async (req, res) => {
  try {
    const { id } = req.params;
    const { contrat_id, date_paiement, montant_paye, mode_paiement, reference, mois_concerne } = req.body;

    if (!contrat_id || !date_paiement || !montant_paye || !mode_paiement || !mois_concerne) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const [result] = await pool.execute(
      `UPDATE paiements
       SET contrat_id = $1, date_paiement = $2, montant_paye = $3, 
           mode_paiement = $4, reference = $5, mois_concerne = $6
       WHERE id = $7`,
      [contrat_id, date_paiement, montant_paye, mode_paiement, reference || null, mois_concerne, id]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Paiement introuvable' });
    }

    res.json({ message: 'Paiement modifié avec succès' });
  } catch (error) {
    console.error('UPDATE paiement error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.telechargerHistoriquePDF = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT p.id, p.date_paiement, p.mois_concerne, p.montant_paye, p.mode_paiement, p.reference,
             l.nom AS locataire, b.adresse AS bien
      FROM paiements p
      JOIN contrats c ON p.contrat_id = c.id
      JOIN locataires l ON c.locataire_id = l.id
      JOIN biens b ON c.bien_id = b.id
      ORDER BY p.date_paiement DESC
    `);

    if (!rows.length) {
      return res.status(404).json({ error: 'Aucun paiement trouvé' });
    }

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=historique_paiements.pdf');

    doc.pipe(res);
    doc.fontSize(18).text('Historique des paiements', { align: 'center' });
    doc.moveDown();

    rows.forEach((p, index) => {
      doc
        .fontSize(11)
        .text(`Paiement #${p.id}`, { underline: true })
        .text(`Locataire : ${p.locataire}`)
        .text(`Bien : ${p.bien}`)
        .text(`Date paiement : ${new Date(p.date_paiement).toLocaleDateString('fr-FR')}`)
        .text(`Mois concerné : ${new Date(p.mois_concerne).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`)
        .text(`Montant payé : ${Number(p.montant_paye).toLocaleString('fr-FR')} FCFA`)
        .text(`Mode : ${p.mode_paiement}`)
        .text(`Référence : ${p.reference || '—'}`)
        .moveDown();

      if ((index + 1) % 3 === 0) doc.addPage();
    });

    doc.end();
  } catch (error) {
    console.error('Erreur génération PDF :', error);
    res.status(500).json({ error: error.message });
  }
};