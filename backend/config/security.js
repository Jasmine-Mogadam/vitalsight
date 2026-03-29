const MIN_JWT_SECRET_LENGTH = 32;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
    const error = new Error(
      `JWT_SECRET must be configured and at least ${MIN_JWT_SECRET_LENGTH} characters long.`
    );
    error.code = 'INVALID_JWT_SECRET';
    throw error;
  }

  return secret;
}

module.exports = {
  MIN_JWT_SECRET_LENGTH,
  getJwtSecret,
};
