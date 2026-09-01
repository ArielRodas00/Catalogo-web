const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const pool    = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { validarPassword, estaFiltrada, hashear, comparar, necesitaRehash } = require('../password');
const bloqueo = require('../bloqueo');
const { COOKIE_NAME, cookieOptions, clearCookieOptions } = require('../authCookie');
const auditoria = require('../auditoria');
const totp = require('../totp');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Intentalo de nuevo en 15 minutos.' }
});

function emitirToken(admin) {
  return jwt.sign(
    { id: admin.id, username: admin.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// POST /api/auth/login
router.post('/login', loginLimiter, async function(req, res, next) {
  try {
    const { username, password, codigo2fa } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const result = await pool.query(
      'SELECT id, username, password, totp_secret, totp_activo, intentos_fallidos, bloqueado_hasta FROM administradores WHERE username=$1',
      [username]
    );

    if (result.rows.length === 0) {
      auditoria.registrar(req, 'login_fallido', 'sesion', null, 'usuario inexistente: ' + username);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const admin = result.rows[0];

    // Bloqueo POR CUENTA, antes de comparar la contraseña. El limitador de
    // express-rate-limit cuenta por IP y en memoria, así que un atacante con
    // varias IPs lo esquiva. Acá importa especialmente: es la cuenta que
    // administra a todos los clientes. Ver bloqueo.js.
    const estadoBloqueo = bloqueo.estaBloqueada(admin);
    if (estadoBloqueo.bloqueada) {
      auditoria.registrar(req, 'login_bloqueado', 'sesion', admin.id,
        'cuenta bloqueada por intentos fallidos', admin);
      return res.status(429).json({
        error: 'Cuenta bloqueada temporalmente por intentos fallidos. Probá de nuevo en ' +
          estadoBloqueo.minutosRestantes + ' minuto' + (estadoBloqueo.minutosRestantes === 1 ? '' : 's') + '.'
      });
    }

    const passwordMatch = await comparar(password, admin.password);

    if (!passwordMatch) {
      // Se audita el intento fallido: una racha de estos es la señal temprana
      // de que alguien está probando contraseñas contra la cuenta que
      // administra todo el negocio.
      const r = await bloqueo.registrarFallo(admin.id);
      auditoria.registrar(req, 'login_fallido', 'sesion', admin.id,
        'contraseña incorrecta (intento ' + r.intentos + ')' + (r.bloqueada ? ' — CUENTA BLOQUEADA' : ''), admin);
      // El mensaje no cambia aunque quede bloqueada: decirlo le confirmaría al
      // atacante que el usuario existe.
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Segundo factor, si la cuenta lo tiene activo.
    if (admin.totp_activo) {
      if (!codigo2fa) {
        // No es un error: le avisamos al frontend que falta el segundo paso.
        return res.status(200).json({ requiere2fa: true });
      }
      if (!(await totp.verificar(codigo2fa, admin.totp_secret))) {
        // Un código de 6 dígitos son un millón de combinaciones y cambia cada
        // 30 segundos: sin contar estos intentos, el segundo factor sería
        // adivinable a fuerza bruta.
        const r = await bloqueo.registrarFallo(admin.id);
        auditoria.registrar(req, 'login_fallido', 'sesion', admin.id,
          'código 2FA incorrecto (intento ' + r.intentos + ')', admin);
        return res.status(401).json({ error: 'Código de verificación incorrecto' });
      }
    }

    // Login correcto: se reinicia el contador de fallos.
    await bloqueo.limpiarIntentos(admin.id);

    // Si la contraseña estaba con un costo de bcrypt viejo, se re-hashea al
    // vuelo: es el único momento en que la tenemos en claro, así las cuentas
    // viejas se actualizan solas. Ver password.js.
    if (necesitaRehash(admin.password)) {
      try {
        await pool.query('UPDATE administradores SET password=$1 WHERE id=$2',
          [await hashear(password), admin.id]);
      } catch (e) {
        console.error('No se pudo re-hashear la contraseña:', e.message);
      }
    }

    // El token va en una cookie httpOnly y NO en el cuerpo de la respuesta:
    // si lo devolviéramos acá, el JavaScript del panel volvería a tenerlo a
    // mano y un XSS podría robarlo. Ver authCookie.js y AUDITORIA.md.
    res.cookie(COOKIE_NAME, emitirToken(admin), cookieOptions());
    auditoria.registrar(req, 'login', 'sesion', admin.id, admin.totp_activo ? 'con 2FA' : null, admin);
    res.json({ ok: true, username: admin.username });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
// Con la cookie httpOnly el frontend ya no puede borrarla por su cuenta, así
// que el cierre de sesión es responsabilidad del servidor.
router.post('/logout', function(req, res) {
  res.clearCookie(COOKIE_NAME, clearCookieOptions());
  res.json({ ok: true });
});

// GET /api/auth/verify
router.get('/verify', authenticateToken, function(req, res) {
  res.json({ valid: true, username: req.user.username, rol: req.user.rol });
});

// POST /api/auth/change-password
// Antes no existía: cambiar la clave del super-admin obligaba a correr un
// script contra la base (scratch-reset-admin-pw.js).
router.post('/change-password', loginLimiter, authenticateToken, async function(req, res, next) {
  try {
    const { passwordActual, passwordNueva } = req.body || {};

    if (!passwordActual || !passwordNueva) {
      return res.status(400).json({ error: 'Tenés que enviar la contraseña actual y la nueva' });
    }

    // Se re-pide la contraseña actual aunque la sesión ya esté abierta: si
    // alguien se sienta frente a una sesión sin bloquear, no debería poder
    // apropiarse de la cuenta cambiándole la clave.
    const result = await pool.query(
      'SELECT id, username, password FROM administradores WHERE id=$1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const admin = result.rows[0];
    if (!(await comparar(passwordActual, admin.password))) {
      auditoria.registrar(req, 'cambio_password_fallido', 'cuenta', admin.id, 'contraseña actual incorrecta');
      return res.status(401).json({ error: 'La contraseña actual no es correcta' });
    }

    const errores = validarPassword(passwordNueva, admin.username);
    if (errores.length > 0) {
      return res.status(400).json({ error: errores.join('. ') });
    }

    if (passwordActual === passwordNueva) {
      return res.status(400).json({ error: 'La contraseña nueva tiene que ser distinta de la actual' });
    }

    // ¿Aparece en filtraciones conocidas? Atrapa el ataque que de verdad
    // ocurre —credential stuffing con contraseñas de brechas reales— contra el
    // que ninguna regla de composición sirve. Se consulta con k-anonymity: la
    // contraseña nunca sale de este servidor (ver password.js).
    const filtracion = await estaFiltrada(passwordNueva);
    if (filtracion.filtrada) {
      auditoria.registrar(req, 'cambio_password_rechazado', 'cuenta', admin.id,
        'contraseña presente en filtraciones conocidas');
      return res.status(400).json({
        error: 'Esa contraseña apareció en filtraciones de datos conocidas' +
          (filtracion.veces ? ' (' + filtracion.veces.toLocaleString('es') + ' veces)' : '') +
          '. Elegí otra distinta.'
      });
    }

    const hash = await hashear(passwordNueva);
    // password_changed_at cierra todas las sesiones abiertas (ver middleware/auth.js).
    await pool.query(
      'UPDATE administradores SET password=$1, password_changed_at=NOW() WHERE id=$2',
      [hash, admin.id]
    );

    auditoria.registrar(req, 'cambio_password', 'cuenta', admin.id, null);

    // También cerramos la sesión actual: al invalidarse su token, dejarle la
    // cookie puesta solo produciría errores raros en el próximo click.
    res.clearCookie(COOKIE_NAME, clearCookieOptions());
    res.json({ ok: true, mensaje: 'Contraseña actualizada. Iniciá sesión de nuevo.' });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Segundo factor (2FA) — ver totp.js
// ============================================================

// POST /api/auth/2fa/setup — genera el secreto y el QR, sin activarlo todavía.
// Recién se activa al confirmar un código válido (ver /2fa/activate): si se
// activara acá y el QR se escaneó mal, la cuenta quedaría inaccesible.
router.post('/2fa/setup', authenticateToken, async function(req, res, next) {
  try {
    const secreto = totp.generarSecreto();
    await pool.query(
      'UPDATE administradores SET totp_secret=$1, totp_activo=false WHERE id=$2',
      [secreto, req.user.id]
    );
    const qr = await totp.generarQr(secreto, req.user.username, 'Panel Central');
    // El secreto se devuelve para quien prefiera tipearlo en vez de escanear.
    res.json({ secreto: secreto, qr: qr });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/2fa/activate — confirma con un código y recién ahí lo activa.
router.post('/2fa/activate', authenticateToken, async function(req, res, next) {
  try {
    const { codigo } = req.body || {};
    if (!codigo) return res.status(400).json({ error: 'Falta el código de verificación' });

    const result = await pool.query('SELECT totp_secret FROM administradores WHERE id=$1', [req.user.id]);
    const secreto = result.rows.length ? result.rows[0].totp_secret : null;
    if (!secreto) {
      return res.status(400).json({ error: 'Primero generá un código con /2fa/setup' });
    }

    if (!(await totp.verificar(codigo, secreto))) {
      return res.status(401).json({ error: 'El código no es válido. Revisá que la hora del teléfono esté correcta.' });
    }

    await pool.query('UPDATE administradores SET totp_activo=true WHERE id=$1', [req.user.id]);
    auditoria.registrar(req, '2fa_activado', 'cuenta', req.user.id, null);
    res.json({ ok: true, mensaje: 'Verificación en dos pasos activada' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/2fa/disable — pide la contraseña, no solo la sesión: apagar
// el segundo factor es justo lo que intentaría alguien con una sesión robada.
router.post('/2fa/disable', authenticateToken, async function(req, res, next) {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Tenés que confirmar con tu contraseña' });

    const result = await pool.query('SELECT password FROM administradores WHERE id=$1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (!(await comparar(password, result.rows[0].password))) {
      auditoria.registrar(req, '2fa_desactivar_fallido', 'cuenta', req.user.id, 'contraseña incorrecta');
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    await pool.query(
      'UPDATE administradores SET totp_activo=false, totp_secret=NULL WHERE id=$1',
      [req.user.id]
    );
    auditoria.registrar(req, '2fa_desactivado', 'cuenta', req.user.id, null);
    res.json({ ok: true, mensaje: 'Verificación en dos pasos desactivada' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/2fa/estado
router.get('/2fa/estado', authenticateToken, async function(req, res, next) {
  try {
    const result = await pool.query('SELECT totp_activo FROM administradores WHERE id=$1', [req.user.id]);
    res.json({ activo: result.rows.length ? result.rows[0].totp_activo === true : false });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
