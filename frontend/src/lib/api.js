const API_BASE = import.meta.env.VITE_API_URL || '';

let authRecoveryHandler = null;

function shouldAttemptAuthRecovery(path, options) {
  if (options.skipAuthRecovery || options._retriedAfterAuth) {
    return false;
  }

  return !['/api/auth/login', '/api/auth/register', '/api/auth/logout'].includes(path);
}

export function configureApi({ onAuthRequired } = {}) {
  authRecoveryHandler = typeof onAuthRequired === 'function' ? onAuthRequired : null;
}

export function createAuthRecoveryError(message = 'Session expired. Sign in to continue.') {
  const error = new Error(message);
  error.code = 'AUTH_RECOVERY_CANCELLED';
  error.status = 401;
  return error;
}

export async function apiFetch(path, options = {}) {
  const {
    headers,
    skipAuthRecovery,
    _retriedAfterAuth,
    ...fetchOptions
  } = options;

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    ...fetchOptions,
  });

  if (response.status === 401 && shouldAttemptAuthRecovery(path, options) && authRecoveryHandler) {
    try {
      await authRecoveryHandler({ path, options });
      return apiFetch(path, {
        ...options,
        _retriedAfterAuth: true,
      });
    } catch (error) {
      throw error?.code === 'AUTH_RECOVERY_CANCELLED'
        ? error
        : createAuthRecoveryError();
    }
  }

  return response;
}

export async function api(path, options = {}) {
  const response = await apiFetch(path, options);

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error = new Error(payload?.error || 'Request failed');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export { API_BASE };
