const rateLimit = require('express-rate-limit');

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please try again later.' },
});

const expensiveApiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests to this endpoint. Please try again later.' },
});

module.exports = {
  authRateLimit,
  expensiveApiRateLimit,
};
