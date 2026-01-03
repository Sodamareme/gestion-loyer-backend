const pool = require('../config/db');

exports.createProprietaire = async (req, res) => {
  try {
    const { nom, telephone, email, adresse } = req.body;
    if (!nom || !telephone) return res.status(400).json({ error: "Nom et téléphone obligatoires" });

    const [result] = await pool.execute(
      'INSERT INTO proprietaires (nom, telephone, email, adresse) VALUES ($1, $2, $3, $4) RETURNING id',
      [nom, telephone, email, adresse]
    );
    res.status(201).json({ id: result[0].id, message: 'Propriétaire créé' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.getAllProprietaires = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM proprietaires ORDER BY nom');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.getProprietaireById = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM proprietaires WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateProprietaire = async (req, res) => {
  try {
    const { nom, telephone, email, adresse } = req.body;
    await pool.execute(
      'UPDATE proprietaires SET nom=$1, telephone=$2, email=$3, adresse=$4 WHERE id=$5',
      [nom, telephone, email, adresse, req.params.id]
    );
    res.json({ message: 'Propriétaire mis à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};