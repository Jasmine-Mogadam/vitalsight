function parseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickNumber(...values) {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function parseBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function getConfig() {
  return {
    apiKey: process.env.PRESAGE_API_KEY?.trim() || '',
    bridgeUrl: process.env.PRESAGE_BRIDGE_URL?.trim().replace(/\/$/, '') || '',
    timeoutMs: Number(process.env.PRESAGE_TIMEOUT_MS || 20000),
  };
}

function canUseVideoUploadFallback() {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  return parseBoolean(process.env.PRESAGE_ALLOW_VIDEO_UPLOAD_IN_PRODUCTION, true);
}

function baseStatus(config) {
  const hasApiKey = Boolean(config.apiKey);
  const hasBridgeUrl = Boolean(config.bridgeUrl);
  const configured = hasApiKey && hasBridgeUrl;

  return {
    provider: configured ? 'presage-bridge' : 'demo',
    ready: false,
    configured,
    hasApiKey,
    hasBridgeUrl,
    message: configured
      ? 'Presage bridge is configured but not reachable.'
      : 'Set PRESAGE_API_KEY and PRESAGE_BRIDGE_URL to enable live Presage vitals.',
  };
}

async function getPresageStatus() {
  const config = getConfig();
  const status = baseStatus(config);

  if (!status.configured) {
    return status;
  }

  let response;
  try {
    response = await fetch(`${config.bridgeUrl}/health`, {
      signal: AbortSignal.timeout(Math.min(config.timeoutMs, 5000)),
    });
  } catch (error) {
    return {
      ...status,
      message: `Presage bridge is unavailable at ${config.bridgeUrl}. Start the bridge service or switch to demo mode.`,
      details: {
        code: error?.code || error?.cause?.code || null,
        bridgeUrl: config.bridgeUrl,
      },
    };
  }

  const payload = await readJson(response);
  if (!response.ok) {
    return {
      ...status,
      message: payload?.error || payload?.message || 'Presage bridge health check failed.',
      details: payload,
    };
  }

  const supportsVideoUploadFallback = canUseVideoUploadFallback() && Boolean(payload?.capabilities?.videoUpload);

  return {
    provider: 'presage-bridge',
    ready: payload?.status === 'ok' || supportsVideoUploadFallback,
    configured: true,
    hasApiKey: status.hasApiKey,
    hasBridgeUrl: status.hasBridgeUrl,
    mode: payload?.mode || null,
    capabilities: payload?.capabilities || null,
    message: payload?.status === 'ok'
      ? payload?.mode === 'sdk'
        ? 'Presage bridge is live and backed by the SmartSpectra SDK.'
        : 'Presage bridge is configured.'
      : supportsVideoUploadFallback
        ? 'Presage bridge supports spot measurements from recorded video clips.'
        : (payload?.error || 'Presage bridge is configured but not fully ready.'),
    details: payload?.worker || null,
  };
}

function createBridgeUnavailableError(config, cause) {
  const error = new Error(
    `Presage bridge is unavailable at ${config.bridgeUrl}. Start the bridge service or switch to demo mode.`
  );
  error.statusCode = 503;
  error.details = {
    code: cause?.code || cause?.cause?.code || null,
    bridgeUrl: config.bridgeUrl,
  };
  return error;
}

function normalizeVitals(payload) {
  const source = payload?.vitals || payload?.measurement || payload?.data || payload || {};

  return {
    heartRate: pickNumber(
      source.heartRate,
      source.heart_rate,
      source.pulse,
      source.pulseRate,
      source.pulse_rate,
      source.pulse_bpm
    ),
    breathingRate: pickNumber(
      source.breathingRate,
      source.breathing_rate,
      source.respiratoryRate,
      source.respiratory_rate,
      source.breathing,
      source.breathing_bpm
    ),
    stressLevel: pickNumber(source.stressLevel, source.stress_level, source.stress),
    hrv: pickNumber(source.hrv, source.heartRateVariability, source.heart_rate_variability),
    spo2: pickNumber(source.spo2, source.SpO2, source.oxygenSaturation, source.oxygen_saturation),
  };
}

async function readJson(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function measureVitals({ image, video, sessionId, timestamp }) {
  const config = getConfig();
  const status = await getPresageStatus();
  const allowVideoUpload = Boolean(video)
    && canUseVideoUploadFallback()
    && Boolean(status.capabilities?.videoUpload);

  if (!status.ready && !allowVideoUpload) {
    const error = new Error(status.message);
    error.statusCode = 503;
    error.details = status.details || null;
    throw error;
  }

  if (!image && !video) {
    const error = new Error('image or video is required');
    error.statusCode = 400;
    throw error;
  }

  let response;
  try {
    response = await fetch(`${config.bridgeUrl}/measure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-presage-api-key': config.apiKey,
      },
      signal: AbortSignal.timeout(config.timeoutMs),
      body: JSON.stringify({
        image,
        video,
        sessionId,
        timestamp,
      }),
    });
  } catch (error) {
    throw createBridgeUnavailableError(config, error);
  }

  const payload = await readJson(response);

  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || 'Presage bridge request failed');
    error.statusCode = response.status;
    error.details = payload;
    throw error;
  }

  return {
    provider: 'presage-bridge',
    vitals: normalizeVitals(payload),
    raw: payload,
  };
}

module.exports = {
  getPresageStatus,
  measureVitals,
};
