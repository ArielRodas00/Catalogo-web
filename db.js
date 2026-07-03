// ============================================================
// db.js — Conexión a PostgreSQL
// ============================================================
// Ahora lee la configuración desde variables de entorno
// en vez de tener los datos hardcodeados en el código.
// ============================================================

require('dotenv').config();
// Carga el archivo .env y convierte cada línea en una
// variable accesible desde process.env.NOMBRE_VARIABLE
// process.env es un objeto global de Node.js que contiene
// todas las variables de entorno del sistema

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  // process.env.DB_HOST lee el valor de DB_HOST del .env
  port:     Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

pool.connect(function(err, client, done) {
  if (err) {
    console.error('Error conectando a PostgreSQL:', err.message);
  } else {
    console.log('Conectado a PostgreSQL correctamente');
    done();
  }
});

module.exports = pool;