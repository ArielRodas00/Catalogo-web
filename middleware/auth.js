const jwt = require('jsonwebtoken');
const pool = require('../db');
const { COOKIE_NAME } = require('../authCookie');

function verificarJwt(token) {
  return new Promise(function(resolve) {
    jwt.verify(token, process.env.JWT_SECRET, function(err, user) {
      resolve(err ? null : user);
    });
  });
}

async function authenticateToken(req, res, next) {
  // La cookie httpOnly es la vía normal del panel web (ver authCookie.js).
  // El header Authorization se sigue aceptando como alternativa para
  // clientes que no son un navegador (tests, curl, una integración futura):
  // no debilita nada, porque para usarlo hay que tener ya un token válido, y
  // el punto del cambio era que el JavaScript de la página no pueda leerlo.
  const cookieToken = req.cookies && req.cookies[COOKIE_NAME];
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const user = await verificarJwt(token);
  if (!user) {
    return res.status(403).json({ error: 'Token inválido o vencido' });
  }

  // Corte de sesiones al cambiar la contraseña: rechazamos cualquier token
  // emitido ANTES del último cambio. Sin esto, un token robado seguiría
  // sirviendo hasta vencer (8hs) aunque la víctima cambiara su clave — que es
  // justamente lo primero que uno hace al sospechar que se la vieron.
  //
  // Cuesta una consulta por request autenticado. Se acepta a conciencia: solo
  // la pagan las rutas del panel (el catálogo público no pasa por acá), es una
  // búsqueda por clave primaria, y cachearla reintroduciría la ventana de
  // validez que este control existe para cerrar.
  try {
    const result = await pool.query(
      'SELECT password_changed_at, rol FROM administradores WHERE id = $1',
      [user.id]
    );

    if (result.rows.length === 0) {
      // La cuenta fue borrada: el token es válido pero ya no corresponde a nadie.
      return res.status(403).json({ error: 'La cuenta ya no existe' });
    }

    const fila = result.rows[0];
    if (fila.password_changed_at) {
      // Ambos lados se comparan EN SEGUNDOS. El `iat` del JWT solo tiene
      // precisión de segundos (se trunca hacia abajo), mientras que
      // password_changed_at guarda milisegundos: comparar en milisegundos
      // rechazaba un token legítimo cuando el cambio de contraseña y el login
      // siguiente caían en el mismo segundo — o sea, justo el caso normal de
      // "cambio mi clave y vuelvo a entrar". Ver AUDITORIA.md.
      //
      // Contrapartida asumida: queda una ventana de hasta 1 segundo en la que
      // un token emitido en ese mismo segundo sigue siendo válido. Es
      // aceptable porque el escenario que este control protege —una sesión
      // robada— usa un token de minutos u horas antes, no de la misma
      // fracción de segundo en que la víctima cambia la contraseña.
      const emitidoSeg = user.iat || 0;
      const cambioSeg = Math.floor(new Date(fila.password_changed_at).getTime() / 1000);
      if (emitidoSeg < cambioSeg) {
        return res.status(403).json({ error: 'Sesión cerrada por cambio de contraseña. Iniciá sesión de nuevo.' });
      }
    }

    // El rol se toma SIEMPRE de la base, nunca del token: si a alguien le
    // bajan los permisos, el cambio tiene efecto en el próximo request y no
    // recién cuando venza su sesión.
    req.user = Object.assign({}, user, { rol: fila.rol || 'admin' });
    next();
  } catch (err) {
    // Falla cerrado: es un control de autenticación, dejar pasar ante un error
    // lo volvería inútil. Además, si la base no responde el panel no sirve
    // igual, porque todos sus datos salen de ahí.
    console.error('Error verificando la sesión:', err.message);
    return res.status(503).json({ error: 'No se pudo verificar la sesión. Intentá de nuevo.' });
  }
}

// Exige un rol determinado. Se usa después de authenticateToken.
// 'admin' puede todo; 'editor' gestiona productos y stock pero no cuentas ni
// métricas del negocio.
function requiereRol(...rolesPermitidos) {
  return function(req, res, next) {
    const rol = (req.user && req.user.rol) || 'admin';
    if (!rolesPermitidos.includes(rol)) {
      return res.status(403).json({ error: 'No tenés permisos para esta acción' });
    }
    next();
  };
}

module.exports = { authenticateToken, requiereRol };
