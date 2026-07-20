// ============================================================
// db-init.js — Inicializa la base del Panel Central
// Carga el schema.sql y crea el super-admin por defecto
// Uso: node db-init.js
// ============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {
        host:     process.env.DB_HOST,
        port:     Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD
      }
);

async function init() {
  try {
    console.log('Conectando a la base de datos...');

    console.log('Cargando schema.sql...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('Schema cargado correctamente');

    const result = await pool.query(
      'SELECT id FROM administradores WHERE username = $1',
      [process.env.ADMIN_USERNAME || 'superadmin']
    );

    if (result.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const password = process.env.ADMIN_PASSWORD || 'admin123';
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO administradores (username, password) VALUES ($1, $2)',
        [process.env.ADMIN_USERNAME || 'superadmin', hash]
      );
      console.log('Super-admin creado');
    } else {
      console.log('Super-admin ya existe');
    }

    console.log('\nBase de datos del Panel Central inicializada correctamente');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
    process.exit(1);
  }
}

init();
