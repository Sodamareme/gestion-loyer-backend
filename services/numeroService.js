const pool = require('../config/db');

exports.generateNumeroDocument = async (type) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // PostgreSQL utilise FOR UPDATE pour verrouiller les lignes
    const [rows] = await connection.execute(
      'SELECT dernier_numero FROM document_compteurs WHERE type_document = $1 FOR UPDATE',
      [type]
    );

    if (!rows.length) {
      throw new Error('Type de document invalide');
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
    throw err;
  } finally {
    connection.release();
  }
};