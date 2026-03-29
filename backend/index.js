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

const app = express();
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === allowedOrigin) {
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

app.use('/api/auth', authRoutes);
app.use('/api/trials', trialRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/presage', presageRoutes);

app.post('/api/analyze', async (req, res) => {
  try {
    const { vitals } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

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
- Heart Rate: ${vitals.heartRate ?? 'unknown'} bpm
- Breathing Rate: ${vitals.breathingRate ?? 'unknown'} breaths/min
- Stress Level: ${vitals.stressLevel ?? 'unknown'}/100
- HRV (Heart Rate Variability): ${vitals.hrv ?? 'unknown'} ms
- Oxygen Saturation: ${vitals.spo2 ?? 'unknown'}%

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

app.post('/api/speak', async (req, res) => {
  try {
    const { text } = req.body;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });

    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
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

app.post('/api/log-vitals', async (req, res) => {
  try {
    const { vitalsHash, timestamp } = req.body;
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) return res.status(500).json({ error: 'SOLANA_PRIVATE_KEY not configured' });

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

app.post('/api/store-vitals', async (req, res) => {
  try {
    const { vitals, sessionId, timestamp } = req.body;
    const keyId = process.env.B2_KEY_ID;
    const appKey = process.env.B2_APP_KEY;
    const bucketId = process.env.B2_BUCKET_ID;

    if (!keyId || !appKey) return res.status(500).json({ error: 'B2 credentials not configured' });

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

app.post('/api/generate-synthetic', async (req, res) => {
  try {
    const { count = 10 } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

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
                  text: `Generate ${count} synthetic patient vitals records for training a computer vision health monitoring model. Each record should represent a different patient scenario (healthy, stressed, post-exercise, elderly, etc.).

Return ONLY a JSON array with objects containing:
- age (18-85)
- gender ("M" or "F")
- heartRate (40-180 bpm)
- breathingRate (8-30 breaths/min)
- stressLevel (0-100)
- hrv (10-120 ms)
- spo2 (88-100%)
- skinTone (1-6, Fitzpatrick scale)
- scenario (brief description)
- label ("normal", "elevated", "concerning", "critical")

Return ONLY valid JSON, no markdown.`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.9 },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini API error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Gemini API error', details: data.error?.message || JSON.stringify(data) });
    }

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const syntheticData = JSON.parse(text);
    res.json({ data: syntheticData, count: syntheticData.length });
  } catch (error) {
    console.error('Synthetic data error:', error);
    res.status(500).json({ error: 'Synthetic data generation failed', details: error.message });
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
