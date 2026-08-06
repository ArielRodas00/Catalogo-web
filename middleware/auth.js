const jwt = require('jsonwebtoken');
const { COOKIE_NAME } = require('../authCookie');

function authenticateToken(req, res, next) {
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

  jwt.verify(token, process.env.JWT_SECRET, function(err, user) {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o vencido' });
    }
    req.user = user;
    next();
  });
}

module.exports = { authenticateToken };
