const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { spawn } = require('node:child_process');

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

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
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

function pickNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

loadBackendEnv();

const REPO_ROOT = path.resolve(__dirname, '..');

function resolveMaybeRelative(filePath) {
  if (!filePath) {
    return '';
  }

  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

const PORT = Number(process.env.PRESAGE_BRIDGE_PORT || 8787);
const HOST = process.env.PRESAGE_BRIDGE_HOST || '127.0.0.1';
const MODE = process.env.PRESAGE_BRIDGE_MODE || 'mock';
const API_KEY = process.env.PRESAGE_API_KEY?.trim() || '';

const SDK_RUNNER_PATH = resolveMaybeRelative(
  process.env.PRESAGE_SDK_RUNNER_PATH?.trim() || 'presage-bridge/native/build/smartspectra_bridge'
);
const SDK_RUNNER_CWD = resolveMaybeRelative(
  process.env.PRESAGE_SDK_RUNNER_CWD?.trim() || path.dirname(SDK_RUNNER_PATH)
);
const SDK_CAMERA_INDEX = Number(process.env.PRESAGE_SDK_CAMERA_INDEX || 0);
const SDK_CAPTURE_WIDTH = Number(process.env.PRESAGE_SDK_CAPTURE_WIDTH || 1280);
const SDK_CAPTURE_HEIGHT = Number(process.env.PRESAGE_SDK_CAPTURE_HEIGHT || 720);
const SDK_BUFFER_DURATION_S = Number(process.env.PRESAGE_SDK_BUFFER_DURATION_S || 0.5);
const SDK_INTERFRAME_DELAY_MS = Number(process.env.PRESAGE_SDK_INTERFRAME_DELAY_MS || 20);
const SDK_VERBOSITY = Number(process.env.PRESAGE_SDK_VERBOSITY || 1);
const SDK_ENABLE_EDGE_METRICS = parseBoolean(process.env.PRESAGE_SDK_ENABLE_EDGE_METRICS, true);
const SDK_SPOT_DURATION_S = Number(process.env.PRESAGE_SDK_SPOT_DURATION_S || 30);
const SDK_SPOT_TIMEOUT_MS = Number(process.env.PRESAGE_SDK_SPOT_TIMEOUT_MS || 90000);
const MAX_JSON_BODY_BYTES = 60 * 1024 * 1024;

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
      if (raw.length > MAX_JSON_BODY_BYTES) {
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

function normalizeVitals(payload) {
  return {
    heartRate: pickNumber(
      payload?.heartRate,
      payload?.heart_rate,
      payload?.pulse,
      payload?.pulseRate,
      payload?.pulse_rate,
      payload?.pulse_bpm
    ),
    breathingRate: pickNumber(
      payload?.breathingRate,
      payload?.breathing_rate,
      payload?.respiratoryRate,
      payload?.respiratory_rate,
      payload?.breathing,
      payload?.breathing_bpm
    ),
    stressLevel: pickNumber(payload?.stressLevel, payload?.stress_level, payload?.stress),
    hrv: pickNumber(payload?.hrv, payload?.heartRateVariability, payload?.heart_rate_variability),
    spo2: pickNumber(payload?.spo2, payload?.SpO2, payload?.oxygenSaturation, payload?.oxygen_saturation),
  };
}

function inferVideoExtension(mimeType) {
  if (typeof mimeType !== 'string') {
    return 'webm';
  }

  if (mimeType.includes('mp4')) {
    return 'mp4';
  }
  if (mimeType.includes('quicktime')) {
    return 'mov';
  }
  if (mimeType.includes('ogg')) {
    return 'ogv';
  }

  return 'webm';
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    return null;
  }

  const match = /^data:([^;,]+);base64,(.+)$/su.exec(dataUrl);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function createSdkBridgeManager() {
  let worker = null;
  let startPromise = null;
  let restarting = false;
  let stdoutBuffer = '';
  let latestMetrics = null;
  let latestRaw = null;
  let latestStatus = null;
  let lastError = null;
  let startedAt = null;

  function buildArgs() {
    return [
      `--api_key=${API_KEY}`,
      `--camera_index=${SDK_CAMERA_INDEX}`,
      `--capture_width=${SDK_CAPTURE_WIDTH}`,
      `--capture_height=${SDK_CAPTURE_HEIGHT}`,
      `--buffer_duration_s=${SDK_BUFFER_DURATION_S}`,
      `--interframe_delay_ms=${SDK_INTERFRAME_DELAY_MS}`,
      `--verbosity=${SDK_VERBOSITY}`,
      `--enable_edge_metrics=${SDK_ENABLE_EDGE_METRICS ? 'true' : 'false'}`,
    ];
  }

  function snapshot() {
    return {
      runnerPath: SDK_RUNNER_PATH,
      running: Boolean(worker),
      startedAt,
      latestStatus,
      latestMetricsAt: latestMetrics?.timestamp || null,
      lastError,
    };
  }

  function handleWorkerMessage(message) {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === 'metrics') {
      latestRaw = message.raw || null;
      latestMetrics = {
        measurementId: message.measurementId || `sdk-${Date.now().toString(36)}`,
        timestamp: message.timestamp || new Date().toISOString(),
        vitals: normalizeVitals(message.vitals || message),
      };
      lastError = null;
      return;
    }

    if (message.type === 'status') {
      latestStatus = {
        code: message.code || null,
        description: message.description || null,
        timestamp: message.timestamp || new Date().toISOString(),
      };
      return;
    }

    if (message.type === 'error') {
      lastError = message.message || 'SmartSpectra worker reported an error';
    }
  }

  function handleStdout(data) {
    stdoutBuffer += data;
    const lines = stdoutBuffer.split(/\r?\n/u);
    stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        handleWorkerMessage(JSON.parse(trimmed));
      } catch {
        console.log(`[presage-sdk] ${trimmed}`);
      }
    }
  }

  function scheduleRestart() {
    if (MODE === 'mock' || restarting) {
      return;
    }

    restarting = true;
    setTimeout(() => {
      restarting = false;
      start().catch((error) => {
        lastError = error.message || 'Failed to restart SmartSpectra worker';
      });
    }, 2000);
  }

  async function start() {
    if (worker) {
      return;
    }
    if (startPromise) {
      return startPromise;
    }

    startPromise = new Promise((resolve, reject) => {
      if (!API_KEY) {
        reject(new Error('PRESAGE_API_KEY is required for sdk mode'));
        return;
      }

      if (!fs.existsSync(SDK_RUNNER_PATH)) {
        reject(new Error(`SmartSpectra runner not found at ${SDK_RUNNER_PATH}`));
        return;
      }

      const child = spawn(SDK_RUNNER_PATH, buildArgs(), {
        cwd: SDK_RUNNER_CWD,
        env: {
          ...process.env,
          PRESAGE_API_KEY: API_KEY,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      worker = child;
      startedAt = new Date().toISOString();
      stdoutBuffer = '';
      lastError = null;

      let settled = false;

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        handleStdout(chunk);
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        const text = chunk.trim();
        if (text) {
          console.error(`[presage-sdk] ${text}`);
          lastError = text;
        }
      });

      child.on('error', (error) => {
        lastError = error.message || 'Failed to start SmartSpectra worker';
        if (worker === child) {
          worker = null;
          startedAt = null;
        }
        latestStatus = {
          code: null,
          description: lastError,
          timestamp: new Date().toISOString(),
        };
        scheduleRestart();
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      child.on('exit', (code, signal) => {
        worker = null;
        startedAt = null;
        latestStatus = {
          code: code ?? null,
          description: `SmartSpectra worker exited${signal ? ` via ${signal}` : ''}`,
          timestamp: new Date().toISOString(),
        };
        if (code !== 0) {
          lastError = `SmartSpectra worker exited with code ${code}${signal ? ` (${signal})` : ''}`;
        }
        scheduleRestart();
      });

      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      }, 1000);
    }).finally(() => {
      startPromise = null;
    });

    return startPromise;
  }

  async function stop() {
    if (!worker) {
      return;
    }

    const child = worker;
    worker = null;

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000);

      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      child.kill('SIGTERM');
    });
  }

  async function measure() {
    await start();

    if (!latestMetrics) {
      const error = new Error(lastError || 'SmartSpectra is running but has not produced metrics yet');
      error.statusCode = 503;
      error.details = snapshot();
      throw error;
    }

    return {
      provider: 'presage-bridge-sdk',
      mode: MODE,
      measurementId: latestMetrics.measurementId,
      timestamp: latestMetrics.timestamp,
      vitals: latestMetrics.vitals,
      raw: latestRaw,
    };
  }

  return {
    measure,
    start,
    stop,
    snapshot,
  };
}

const sdkBridge = createSdkBridgeManager();

async function runSdkSpotMeasurement(videoDataUrl) {
  if (!API_KEY) {
    const error = new Error('PRESAGE_API_KEY is required for sdk mode');
    error.statusCode = 503;
    throw error;
  }

  if (!fs.existsSync(SDK_RUNNER_PATH)) {
    const error = new Error(`SmartSpectra runner not found at ${SDK_RUNNER_PATH}`);
    error.statusCode = 503;
    throw error;
  }

  const parsed = parseDataUrl(videoDataUrl);
  if (!parsed) {
    const error = new Error('A valid base64 video data URL is required');
    error.statusCode = 400;
    throw error;
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'presage-spot-'));
  const tempVideoPath = path.join(tempDir, `capture.${inferVideoExtension(parsed.mimeType)}`);
  await fs.promises.writeFile(tempVideoPath, parsed.buffer);

  try {
    const args = [
      `--api_key=${API_KEY}`,
      '--mode=spot',
      `--input_video_path=${tempVideoPath}`,
      `--spot_duration_s=${SDK_SPOT_DURATION_S}`,
      `--camera_index=${SDK_CAMERA_INDEX}`,
      `--capture_width=${SDK_CAPTURE_WIDTH}`,
      `--capture_height=${SDK_CAPTURE_HEIGHT}`,
      `--interframe_delay_ms=${SDK_INTERFRAME_DELAY_MS}`,
      `--verbosity=${SDK_VERBOSITY}`,
      '--enable_edge_metrics=false',
    ];

    const result = await new Promise((resolve, reject) => {
      const child = spawn(SDK_RUNNER_PATH, args, {
        cwd: SDK_RUNNER_CWD,
        env: {
          ...process.env,
          PRESAGE_API_KEY: API_KEY,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let metricsPayload = null;

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        const error = new Error('SmartSpectra spot measurement timed out');
        error.statusCode = 504;
        reject(error);
      }, SDK_SPOT_TIMEOUT_MS);

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/u);
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          try {
            const message = JSON.parse(trimmed);
            if (message.type === 'metrics') {
              metricsPayload = message;
            }
          } catch {
            console.log(`[presage-sdk-spot] ${trimmed}`);
          }
        }
      });

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderrBuffer += chunk;
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on('exit', (code, signal) => {
        clearTimeout(timeout);

        if (metricsPayload) {
          resolve({
            provider: 'presage-bridge-sdk',
            mode: `${MODE}-spot`,
            measurementId: metricsPayload.measurementId || `spot-${Date.now().toString(36)}`,
            timestamp: new Date().toISOString(),
            vitals: normalizeVitals(metricsPayload.vitals || metricsPayload),
            raw: metricsPayload,
          });
          return;
        }

        const error = new Error(
          stderrBuffer.trim()
          || `SmartSpectra spot measurement exited with code ${code}${signal ? ` (${signal})` : ''}`
        );
        error.statusCode = 502;
        reject(error);
      });
    });

    return result;
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleHealth(res) {
  if (MODE === 'sdk') {
    const capabilities = {
      imagePolling: false,
      videoUpload: fs.existsSync(SDK_RUNNER_PATH),
    };

    try {
      await sdkBridge.start();
      capabilities.imagePolling = true;
    } catch (error) {
      sendJson(res, capabilities.videoUpload ? 200 : 503, {
        status: capabilities.videoUpload ? 'degraded' : 'error',
        service: 'presage-bridge',
        mode: MODE,
        timestamp: new Date().toISOString(),
        error: error.message || 'Failed to start SmartSpectra worker',
        worker: sdkBridge.snapshot(),
        capabilities,
      });
      return;
    }

    sendJson(res, 200, {
      status: 'ok',
      service: 'presage-bridge',
      mode: MODE,
      timestamp: new Date().toISOString(),
      worker: sdkBridge.snapshot(),
      capabilities,
    });
    return;
  }

  sendJson(res, 200, {
    status: 'ok',
    service: 'presage-bridge',
    mode: MODE,
    timestamp: new Date().toISOString(),
    worker: MODE === 'sdk' ? sdkBridge.snapshot() : null,
    capabilities: {
      imagePolling: MODE === 'mock',
      videoUpload: false,
    },
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    await handleHealth(res);
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
      const video = body?.video;

      if (MODE === 'sdk' && typeof video === 'string' && video) {
        const result = await runSdkSpotMeasurement(video);
        sendJson(res, 200, result);
        return;
      }

      if (typeof image !== 'string' || !image) {
        sendJson(res, 400, { error: MODE === 'sdk' ? 'image or video is required' : 'image is required' });
        return;
      }

      if (MODE === 'mock') {
        sendJson(res, 200, {
          provider: 'presage-bridge-mock',
          mode: MODE,
          vitals: mockVitals(image, body?.sessionId),
          measurementId: `mock-${Date.now().toString(36)}`,
          timestamp: body?.timestamp || new Date().toISOString(),
        });
        return;
      }

      if (MODE === 'sdk') {
        const result = await sdkBridge.measure();
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 501, {
        error: `Bridge mode "${MODE}" is not implemented yet`,
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, {
        error: error.message || 'Invalid request',
        details: error.details || null,
      });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

async function shutdown() {
  server.close();
  await sdkBridge.stop().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, async () => {
  console.log(`Presage bridge listening on http://${HOST}:${PORT} (${MODE} mode)`);

  if (MODE === 'sdk') {
    try {
      await sdkBridge.start();
    } catch (error) {
      console.error(`Failed to start SmartSpectra worker: ${error.message || error}`);
    }
  }
});
