const pool = require('../config/db');

exports.generateNumeroDocument = async (type) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Vérifier si le type existe, sinon le créer
    let [rows] = await connection.execute(
      'SELECT dernier_numero FROM document_compteurs WHERE type_document = $1 FOR UPDATE',
      [type]
    );

    if (!rows.length) {
      // Créer le type automatiquement SANS description
      await connection.execute(
        'INSERT INTO document_compteurs (type_document, dernier_numero) VALUES ($1, $2)',
        [type, 0]
      );
      
      console.log(`✅ Type de document ${type} créé automatiquement`);
      rows = [{ dernier_numero: 0 }];
    }

    const next = rows[0].dernier_numero + 1;

    await connection.execute(
      'UPDATE document_compteurs SET dernier_numero = $1 WHERE type_document = $2',
      [next, type]
    );

    await connection.commit();

    return `${type}-${String(next).padStart(4, '0')}`;
  } catch (err) {
    await connection.rollback();
    console.error('❌ Erreur generateNumeroDocument:', err);
    throw err;
  } finally {
    connection.release();
  }
};