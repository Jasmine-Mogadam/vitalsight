const jwt = require('jsonwebtoken');
const { getUserWithProfile } = require('../db');

function optionalAuth(req, _res, next) {
  const token = req.cookies?.token;
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
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
