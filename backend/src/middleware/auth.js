/**
 * RMG Auto Parts — Middleware de Autenticación
 * JWT · Perfiles: gerente (acceso total + autorizaciones) | administrador (acceso total, sin autorizaciones) | vendedor (resto)
 */

const jwt = require('jsonwebtoken');

/**
 * Verifica JWT y adjunta usuario al request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado. Inicia sesión nuevamente.' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

/**
 * Verifica que el usuario tenga el rol requerido
 * @param {string|string[]} roles — 'admin' | ['admin', 'ventas']
 */
const requireRole = (roles) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({
        error: `Acceso denegado. Se requiere rol: ${allowedRoles.join(' o ')}`,
      });
    }

    next();
  };
};

/**
 * Verifica que el usuario pertenezca al segmento correcto
 * Útil para que clientes B2B solo vean sus precios
 */
const requireSegmento = (segmentos) => {
  const allowed = Array.isArray(segmentos) ? segmentos : [segmentos];

  return (req, res, next) => {
    if (req.user.rol === 'admin') return next(); // Admin siempre pasa

    if (!allowed.includes(req.user.segmento)) {
      return res.status(403).json({ error: 'Acceso denegado para este segmento' });
    }
    next();
  };
};

module.exports = { authenticate, requireRole, requireSegmento };
