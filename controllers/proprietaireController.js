const pool = require('../config/db');

exports.createProprietaire = async (req, res) => {
  try {
    const { nom, telephone, email, adresse } = req.body;
    if (!nom || !telephone) return res.status(400).json({ error: "Nom et téléphone obligatoires" });

    const [result] = await pool.execute(
      'INSERT INTO proprietaires (nom, telephone, email, adresse) VALUES (?, ?, ?, ?)',
      [nom, telephone, email, adresse]
    );
    res.status(201).json({ id: result.insertId, message: 'Propriétaire créé' });
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
    const [rows] = await pool.execute('SELECT * FROM proprietaires WHERE id = ?', [req.params.id]);
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
      'UPDATE proprietaires SET nom=?, telephone=?, email=?, adresse=? WHERE id=?',
      [nom, telephone, email, adresse, req.params.id]
    );
    res.json({ message: 'Propriétaire mis à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
