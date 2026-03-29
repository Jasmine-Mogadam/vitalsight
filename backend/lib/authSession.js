const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/security');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
const SESSION_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function getRequestOrigin(req) {
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${protocol}://${req.get('host')}`;
}

function cookieOptions(req) {
  const requestOrigin = getRequestOrigin(req);
  const callerOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim().replace(/\/+$/, '') : '';
  const isCrossOrigin = Boolean(callerOrigin) && callerOrigin !== requestOrigin;

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: isCrossOrigin ? 'none' : 'strict',
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

function createAuthToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, getJwtSecret(), {
    expiresIn: SESSION_TTL_SECONDS,
  });
}

function setAuthCookie(req, res, user) {
  res.cookie('token', createAuthToken(user), cookieOptions(req));
}

function clearAuthCookie(req, res) {
  res.clearCookie('token', {
    ...cookieOptions(req),
    maxAge: undefined,
  });
}

function shouldRefreshAuthToken(payload) {
  if (!payload?.iat) return true;
  return Date.now() - (payload.iat * 1000) >= SESSION_REFRESH_INTERVAL_MS;
}

module.exports = {
  clearAuthCookie,
  cookieOptions,
  createAuthToken,
  setAuthCookie,
  shouldRefreshAuthToken,
  SESSION_REFRESH_INTERVAL_MS,
  SESSION_TTL_MS,
};
