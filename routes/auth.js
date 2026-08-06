const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { COOKIE_NAME, cookieOptions, clearCookieOptions } = require('../authCookie');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Intentalo de nuevo en 15 minutos.' }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async function(req, res, next) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const result = await pool.query(
      'SELECT id, username, password FROM administradores WHERE username=$1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const admin = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, admin.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // El token va en una cookie httpOnly y NO en el cuerpo de la respuesta:
    // si lo devolviéramos acá, el JavaScript del panel volvería a tenerlo a
    // mano y un XSS podría robarlo — que es justo lo que este cambio evita.
    // Ver authCookie.js y AUDITORIA.md.
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.json({ ok: true, username: admin.username });

  } catch (err) {
    console.error('LOGIN ERROR:', err.message, err.stack);
    next(err);
  }
});

// POST /api/auth/logout
// Antes no existía: el "cerrar sesión" solo borraba el token del navegador.
// Con la cookie httpOnly el frontend ya no puede borrarla por su cuenta, así
// que el cierre de sesión pasa a ser responsabilidad del servidor.
router.post('/logout', function(req, res) {
  res.clearCookie(COOKIE_NAME, clearCookieOptions());
  res.json({ ok: true });
});

// GET /api/auth/verify
router.get('/verify', authenticateToken, function(req, res) {
  res.json({ valid: true, username: req.user.username });
});

module.exports = router;
