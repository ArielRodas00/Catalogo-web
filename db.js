// ============================================================
// db.js — Conexión a PostgreSQL
// ============================================================

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max:      Number(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 5000
});

pool.on('error', function(err) {
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

pool.connect(function(err, _client, done) {
  if (err) {
    console.error('Error conectando a PostgreSQL:', err.message);
  } else {
    console.log('Conectado a PostgreSQL correctamente');
    done();
  }
});

module.exports = pool;