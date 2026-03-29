const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
require('./db');

const authRoutes = require('./routes/auth');
const trialRoutes = require('./routes/trials');
const formRoutes = require('./routes/forms');
const patientRoutes = require('./routes/patients');
const inboxRoutes = require('./routes/inbox');
const presageRoutes = require('./routes/presage');
const { startScheduler } = require('./services/scheduler');
const { requireAuth } = require('./middleware/auth');
const { expensiveApiRateLimit } = require('./middleware/rateLimit');
const { getJwtSecret } = require('./config/security');

const app = express();
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173'];
const MAX_SPEECH_TEXT_LENGTH = 2_000;
const LOCATION_SEARCH_RESULT_LIMIT = 6;
const LOCATION_AUTOCOMPLETE_PROVIDER = process.env.LOCATION_AUTOCOMPLETE_PROVIDER || 'geoapify';

function normalizeOrigin(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

function getAllowedOrigins() {
  const configuredOrigins = [process.env.FRONTEND_ORIGINS, process.env.FRONTEND_ORIGIN]
    .filter(Boolean)
    .flatMap((value) => value.split(','))
    .map(normalizeOrigin)
    .filter(Boolean);

  return configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNullableNumber(value) {
  return value === null || value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function isValidIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isSafeStorageSegment(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

getJwtSecret();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      const normalizedOrigin = normalizeOrigin(origin);
      const allowedOrigins = getAllowedOrigins();

      if (!origin || allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

app.use(express.static(path.join(__dirname, 'public')));

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-05-20';

app.use('/api', (req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vitalsight-api' });
});

app.get('/api/locations/search', requireAuth, async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length < 2) {
    return res.json({ results: [] });
  }

  try {
    if (LOCATION_AUTOCOMPLETE_PROVIDER !== 'geoapify') {
      return res.status(500).json({ error: 'Unsupported location provider configuration' });
    }

    const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
    if (!apiKey) {
      return res.status(500).json({ error: 'GEOAPIFY_API_KEY not configured' });
    }

    const searchUrl = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
    searchUrl.searchParams.set('text', query);
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('limit', String(LOCATION_SEARCH_RESULT_LIMIT));
    searchUrl.searchParams.set('apiKey', apiKey);

    const response = await fetch(searchUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const details = await response.text();
      console.error('Location search error:', details);
      return res.status(502).json({ error: 'Location search failed' });
    }

    const payload = await response.json();
    const results = Array.isArray(payload.results)
      ? payload.results.map((item) => ({
          id: item.place_id || item.formatted,
          label: item.formatted,
          value: item.formatted || [item.city, item.state, item.country].filter(Boolean).join(', '),
        }))
      : [];

    res.json({ results });
  } catch (error) {
    console.error('Location search error:', error);
    res.status(500).json({ error: 'Location search failed' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/trials', trialRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/presage', presageRoutes);

app.post('/api/analyze', requireAuth, expensiveApiRateLimit, async (req, res) => {
  try {
    const { vitals } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    if (!isPlainObject(vitals)) {
      return res.status(400).json({ error: 'Vitals payload must be an object' });
    }

    const normalizedVitals = {
      heartRate: isFiniteNullableNumber(vitals.heartRate) ? vitals.heartRate : null,
      breathingRate: isFiniteNullableNumber(vitals.breathingRate) ? vitals.breathingRate : null,
      stressLevel: isFiniteNullableNumber(vitals.stressLevel) ? vitals.stressLevel : null,
      hrv: isFiniteNullableNumber(vitals.hrv) ? vitals.hrv : null,
      spo2: isFiniteNullableNumber(vitals.spo2) ? vitals.spo2 : null,
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a clinical trial health monitoring AI assistant. Analyze these patient vitals and provide a brief, friendly health insight (2-3 sentences). Be encouraging but note any concerns. Some values may be unavailable from the capture provider; treat missing values as "unknown" instead of guessing.

Vitals:
- Heart Rate: ${normalizedVitals.heartRate ?? 'unknown'} bpm
- Breathing Rate: ${normalizedVitals.breathingRate ?? 'unknown'} breaths/min
- Stress Level: ${normalizedVitals.stressLevel ?? 'unknown'}/100
- HRV (Heart Rate Variability): ${normalizedVitals.hrv ?? 'unknown'} ms
- Oxygen Saturation: ${normalizedVitals.spo2 ?? 'unknown'}%

Provide a brief analysis suitable for a patient check-in.`,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini API error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Gemini API error', details: data.error?.message || JSON.stringify(data) });
    }

    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to analyze vitals at this time.';
    res.json({ analysis });
  } catch (error) {
    console.error('Gemini error:', error);
    res.status(500).json({ error: 'Analysis failed', details: error.message });
  }
});

app.post('/api/speak', requireAuth, expensiveApiRateLimit, async (req, res) => {
  try {
    const { text } = req.body;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_SPEECH_TEXT_LENGTH) {
      return res.status(400).json({ error: 'Text is required and must be under 2000 characters' });
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs error:', errText);
      return res.status(500).json({ error: 'Speech synthesis failed' });
    }

    const audioBuffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error('ElevenLabs error:', error);
    res.status(500).json({ error: 'Speech synthesis failed' });
  }
});

app.post('/api/log-vitals', requireAuth, expensiveApiRateLimit, async (req, res) => {
  try {
    const { vitalsHash, timestamp } = req.body;
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) return res.status(500).json({ error: 'SOLANA_PRIVATE_KEY not configured' });
    if (typeof vitalsHash !== 'string' || !/^[a-fA-F0-9]{1,128}$/.test(vitalsHash)) {
      return res.status(400).json({ error: 'Invalid vitals hash' });
    }
    if (!isValidIsoTimestamp(timestamp)) {
      return res.status(400).json({ error: 'Invalid timestamp' });
    }

    const { Connection, Keypair, Transaction, TransactionInstruction, PublicKey } = await import('@solana/web3.js');
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(privateKey)));

    const memoProgramId = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    const memo = JSON.stringify({ vitalsHash, timestamp, app: 'vitalsight' });

    const instruction = new TransactionInstruction({
      keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: true }],
      programId: memoProgramId,
      data: Buffer.from(memo),
    });

    const transaction = new Transaction().add(instruction);
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;
    transaction.sign(keypair);

    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(signature);

    res.json({
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    });
  } catch (error) {
    console.error('Solana error:', error);
    res.status(500).json({ error: 'Blockchain logging failed' });
  }
});

app.post('/api/store-vitals', requireAuth, expensiveApiRateLimit, async (req, res) => {
  try {
    const { vitals, sessionId, timestamp } = req.body;
    const keyId = process.env.B2_KEY_ID;
    const appKey = process.env.B2_APP_KEY;
    const bucketId = process.env.B2_BUCKET_ID;

    if (!keyId || !appKey) return res.status(500).json({ error: 'B2 credentials not configured' });
    if (!isPlainObject(vitals)) {
      return res.status(400).json({ error: 'Vitals payload must be an object' });
    }
    if (!isSafeStorageSegment(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    if (!isValidIsoTimestamp(timestamp)) {
      return res.status(400).json({ error: 'Invalid timestamp' });
    }

    const authResponse = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${appKey}`).toString('base64')}` },
    });
    const auth = await authResponse.json();

    const uploadUrlResponse = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST',
      headers: { Authorization: auth.authorizationToken },
      body: JSON.stringify({ bucketId }),
    });
    const uploadUrl = await uploadUrlResponse.json();

    const fileName = `vitals/${sessionId}/${timestamp}.json`;
    const fileContent = JSON.stringify({ vitals, sessionId, timestamp });

    const uploadResponse = await fetch(uploadUrl.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: uploadUrl.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': 'application/json',
        'X-Bz-Content-Sha1': 'do_not_verify',
      },
      body: fileContent,
    });

    const result = await uploadResponse.json();
    res.json({ fileId: result.fileId, fileName: result.fileName });
  } catch (error) {
    console.error('B2 error:', error);
    res.status(500).json({ error: 'Storage failed' });
  }
});

app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`VitalSight API running on port ${PORT}`);
  startScheduler();
});
