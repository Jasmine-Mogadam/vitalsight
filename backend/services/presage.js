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

function getConfig() {
  return {
    apiKey: process.env.PRESAGE_API_KEY?.trim() || '',
    bridgeUrl: process.env.PRESAGE_BRIDGE_URL?.trim().replace(/\/$/, '') || '',
    timeoutMs: Number(process.env.PRESAGE_TIMEOUT_MS || 20000),
  };
}

function getPresageStatus() {
  const config = getConfig();
  const hasApiKey = Boolean(config.apiKey);
  const hasBridgeUrl = Boolean(config.bridgeUrl);
  const ready = hasApiKey && hasBridgeUrl;

  return {
    provider: ready ? 'presage-bridge' : 'demo',
    ready,
    hasApiKey,
    hasBridgeUrl,
    message: ready
      ? 'Presage bridge is configured.'
      : 'Set PRESAGE_API_KEY and PRESAGE_BRIDGE_URL to enable live Presage vitals.',
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

async function measureVitals({ image, sessionId, timestamp }) {
  const config = getConfig();
  const status = getPresageStatus();

  if (!status.ready) {
    const error = new Error(status.message);
    error.statusCode = 503;
    throw error;
  }

  if (!image) {
    const error = new Error('image is required');
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
