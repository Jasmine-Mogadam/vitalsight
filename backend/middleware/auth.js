const jwt = require('jsonwebtoken');
const { getUserWithProfile } = require('../db');
const { getJwtSecret } = require('../config/security');

function optionalAuth(req, _res, next) {
  const token = req.cookies?.token;
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = getUserWithProfile(payload.id);
  } catch {
    req.user = null;
  }

  next();
}

function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  });
}

function requireRole(role) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (req.user.role !== role) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    });
  };
}

module.exports = {
  optionalAuth,
  requireAuth,
  requireRole,
};
