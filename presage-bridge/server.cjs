const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

function loadBackendEnv() {
  const envPath = path.resolve(__dirname, '../backend/.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, 'utf8');
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadBackendEnv();

const PORT = Number(process.env.PRESAGE_BRIDGE_PORT || 8787);
const HOST = process.env.PRESAGE_BRIDGE_HOST || '127.0.0.1';
const MODE = process.env.PRESAGE_BRIDGE_MODE || 'mock';
const API_KEY = process.env.PRESAGE_API_KEY?.trim() || '';

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function collectJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 15 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function hashString(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mockVitals(image, sessionId) {
  const seed = hashString(`${image.length}:${sessionId || 'default'}`);

  const heartRate = 62 + (seed % 22);
  const breathingRate = 12 + (Math.floor(seed / 7) % 8);
  const stressLevel = 18 + (Math.floor(seed / 17) % 45);
  const hrv = 32 + (Math.floor(seed / 29) % 35);
  const spo2 = clamp(96 + (Math.floor(seed / 37) % 4), 95, 100);

  return {
    heartRate,
    breathingRate,
    stressLevel,
    hrv,
    spo2,
  };
}

function assertAuthorized(req) {
  if (!API_KEY) {
    return { ok: true };
  }

  const provided = req.headers['x-presage-api-key'];
  if (provided === API_KEY) {
    return { ok: true };
  }

  return { ok: false, statusCode: 401, error: 'Invalid Presage API key for bridge' };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      service: 'presage-bridge',
      mode: MODE,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/measure') {
    const auth = assertAuthorized(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { error: auth.error });
      return;
    }

    try {
      const body = await collectJson(req);
      const image = body?.image;

      if (!image || typeof image !== 'string') {
        sendJson(res, 400, { error: 'image is required' });
        return;
      }

      if (MODE !== 'mock') {
        sendJson(res, 501, {
          error: `Bridge mode "${MODE}" is not implemented yet`,
        });
        return;
      }

      sendJson(res, 200, {
        provider: 'presage-bridge-mock',
        mode: MODE,
        vitals: mockVitals(image, body?.sessionId),
        measurementId: `mock-${Date.now().toString(36)}`,
        timestamp: body?.timestamp || new Date().toISOString(),
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid request' });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`Presage bridge listening on http://${HOST}:${PORT} (${MODE} mode)`);
});
