const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'vitalsight-api' });
});

// Gemini API - Vitals Analysis
app.post('/api/analyze', async (req, res) => {
  try {
    const { vitals } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a clinical trial health monitoring AI assistant. Analyze these patient vitals and provide a brief, friendly health insight (2-3 sentences). Be encouraging but note any concerns.

Vitals:
- Heart Rate: ${vitals.heartRate} bpm
- Breathing Rate: ${vitals.breathingRate} breaths/min
- Stress Level: ${vitals.stressLevel}/100
- HRV (Heart Rate Variability): ${vitals.hrv} ms
- Oxygen Saturation: ${vitals.spo2}%

Provide a brief analysis suitable for a patient check-in.`
            }]
          }]
        })
      }
    );

    const data = await response.json();
    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to analyze vitals at this time.';
    res.json({ analysis });
  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// ElevenLabs - Text to Speech
app.post('/api/speak', async (req, res) => {
  try {
    const { text } = req.body;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });

    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Sarah voice

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
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
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs error:', errText);
      return res.status(500).json({ error: 'Speech synthesis failed' });
    }

    const audioBuffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error('ElevenLabs error:', err);
    res.status(500).json({ error: 'Speech synthesis failed' });
  }
});

// Solana - Log vitals hash
app.post('/api/log-vitals', async (req, res) => {
  try {
    const { vitalsHash, timestamp } = req.body;
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) return res.status(500).json({ error: 'SOLANA_PRIVATE_KEY not configured' });

    // Dynamic import for Solana (ESM module)
    const { Connection, Keypair, Transaction, TransactionInstruction, PublicKey } = await import('@solana/web3.js');

    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(privateKey)));

    // Use Memo program to log vitals hash on-chain
    const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    const memo = JSON.stringify({ vitalsHash, timestamp, app: 'vitalsight' });

    const instruction = new TransactionInstruction({
      keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: true }],
      programId: MEMO_PROGRAM_ID,
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
  } catch (err) {
    console.error('Solana error:', err);
    res.status(500).json({ error: 'Blockchain logging failed' });
  }
});

// Backblaze B2 - Store vitals data
app.post('/api/store-vitals', async (req, res) => {
  try {
    const { vitals, sessionId, timestamp } = req.body;
    const keyId = process.env.B2_KEY_ID;
    const appKey = process.env.B2_APP_KEY;
    const bucketId = process.env.B2_BUCKET_ID;

    if (!keyId || !appKey) return res.status(500).json({ error: 'B2 credentials not configured' });

    // Authorize with B2
    const authResponse = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      headers: { Authorization: 'Basic ' + Buffer.from(`${keyId}:${appKey}`).toString('base64') }
    });
    const auth = await authResponse.json();

    // Get upload URL
    const uploadUrlResponse = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST',
      headers: { Authorization: auth.authorizationToken },
      body: JSON.stringify({ bucketId })
    });
    const uploadUrl = await uploadUrlResponse.json();

    // Upload vitals JSON
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
  } catch (err) {
    console.error('B2 error:', err);
    res.status(500).json({ error: 'Storage failed' });
  }
});

// Synthetic Data Generation (Kinetic Vision)
app.post('/api/generate-synthetic', async (req, res) => {
  try {
    const { count = 10 } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
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

Return ONLY valid JSON, no markdown.`
            }]
          }],
          generationConfig: { temperature: 0.9 }
        })
      }
    );

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    // Strip markdown code fences if present
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const syntheticData = JSON.parse(text);
    res.json({ data: syntheticData, count: syntheticData.length });
  } catch (err) {
    console.error('Synthetic data error:', err);
    res.status(500).json({ error: 'Synthetic data generation failed' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`VitalSight API running on port ${PORT}`);
});
