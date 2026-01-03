const { Pool } = require('pg');
require('dotenv').config();

// Configuration de la connexion PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10, // Nombre maximum de connexions
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Wrapper pour compatibilité avec le code MySQL existant
// Convertit les queries MySQL (?) vers PostgreSQL ($1, $2, $3...)
const originalQuery = pool.query.bind(pool);

pool.query = async function(sql, params) {
  // Convertir les ? en $1, $2, $3...
  let index = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++index}`);
  
  const result = await originalQuery(pgSql, params);
  return result;
};

// Méthode execute pour compatibilité avec mysql2
pool.execute = async function(sql, params = []) {
  try {
    // Convertir les ? en $1, $2, $3...
    let index = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++index}`);
    
    const result = await originalQuery(pgSql, params);
    
    // Retourner au format MySQL: [rows, fields]
    return [result.rows, result.fields];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Méthode getConnection pour compatibilité avec les transactions
pool.getConnection = async function() {
  const client = await pool.connect();
  
  // Wrapper pour compatibilité
  return {
    execute: async function(sql, params = []) {
      let index = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++index}`);
      const result = await client.query(pgSql, params);
      return [result.rows, result.fields];
    },
    beginTransaction: async function() {
      await client.query('BEGIN');
    },
    commit: async function() {
      await client.query('COMMIT');
    },
    rollback: async function() {
      await client.query('ROLLBACK');
    },
    release: function() {
      client.release();
    }
  };
};

// Test de connexion
pool.on('connect', () => {
  console.log('✅ Connected to Neon PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;