const pool = require('../config/db');

async function initDocumentTypes() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const types = [
      { type: 'QL', description: 'Quittance de Loyer' },
      { type: 'AE', description: 'Avis d\'Écheance' },
      { type: 'QC', description: 'Quittance de Caution' }
    ];

    for (const { type, description } of types) {
      // Vérifier si le type existe déjà
      const [existing] = await connection.execute(
        'SELECT * FROM document_compteurs WHERE type_document = $1',
        [type]
      );

      if (existing.length === 0) {
        // Insérer le nouveau type SANS la colonne description
        await connection.execute(
          'INSERT INTO document_compteurs (type_document, dernier_numero) VALUES ($1, $2)',
          [type, 0]
        );
        console.log(`✅ Type ${type} (${description}) initialisé`);
      } else {
        console.log(`ℹ️  Type ${type} existe déjà avec le numéro ${existing[0].dernier_numero}`);
      }
    }

    await connection.commit();
    console.log('✅ Initialisation des types de documents terminée');
  } catch (error) {
    await connection.rollback();
    console.error('❌ Erreur lors de l\'initialisation:', error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

initDocumentTypes().catch(console.error);