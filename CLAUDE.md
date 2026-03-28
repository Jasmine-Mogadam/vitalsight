# VitalSight — Hackathon Project

AR-powered remote patient vitals monitor for clinical trials. Webcam-based contactless vital sign detection with AI analysis, voice coaching, and blockchain audit trail.

## Project Structure

```
frontend/               Vite + React SPA
  src/App.jsx           Main app — all pages in one file (Monitor, Synthetic Data, Business Plan, Social Impact)
  src/App.css           Dark theme UI styles
  index.html            Entry point — loads MediaPipe via CDN script tags
  netlify.toml          Netlify deploy config (proxies /api/* to Fly.io backend)
  vite.config.js        Dev proxy for /api to localhost:3001

backend/                Express API server
  index.js              All endpoints in one file
  fly.toml              Fly.io deploy config
  Dockerfile            Production container
  .env.example          Required environment variables
```

## Running Locally

```bash
# Backend (in one terminal)
cd backend
cp .env.example .env    # fill in API keys
npm install
npm run dev             # starts on :3001

# Frontend (in another terminal)
cd frontend
npm install
npm run dev             # starts on :5173, proxies /api to :3001
```

## API Endpoints (backend)

| Endpoint | Method | Purpose | External API |
|---|---|---|---|
| `/api/health` | GET | Health check | — |
| `/api/analyze` | POST | Vitals analysis | Google Gemini |
| `/api/speak` | POST | Text-to-speech | ElevenLabs |
| `/api/log-vitals` | POST | Blockchain logging | Solana devnet |
| `/api/store-vitals` | POST | Persist vitals JSON | Backblaze B2 |
| `/api/generate-synthetic` | POST | Generate training data | Google Gemini |

## Environment Variables (backend/.env)

- `GEMINI_API_KEY` — Google AI Studio key (used by /analyze and /generate-synthetic)
- `ELEVENLABS_API_KEY` — ElevenLabs key (used by /speak)
- `ELEVENLABS_VOICE_ID` — Voice ID (default: Sarah `EXAVITQu4vr4xnSDxMaL`)
- `SOLANA_PRIVATE_KEY` — JSON array of keypair bytes for devnet (used by /log-vitals)
- `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET_ID` — Backblaze B2 credentials (used by /store-vitals)

## Frontend Environment Variables

- `VITE_API_URL` — Backend URL override (empty in dev since Vite proxies; set to Fly.io URL in production)
- `VITE_PRESAGE_API_KEY` — Presage SDK API key (optional, falls back to simulated vitals)

## Key Technical Details

- **MediaPipe Face Mesh** is loaded via CDN `<script>` tags (not npm) — accessed as `window.FaceMesh` and `window.Camera`. The npm packages don't support ESM imports.
- **AR overlay** uses a `<canvas>` layered over the `<video>` element. Vitals badges are anchored to face landmark positions (forehead=10, nose=1, chin=152, cheeks=234/454).
- **Solana** uses the Memo program (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`) on devnet — no custom smart contract needed. Vitals hashes are logged as memo data.
- **Presage SDK** integration has a hook in `startCamera()` — if `window.Presage` exists, it connects and overrides simulated vitals. Otherwise falls back to jittered demo values.
- Video is CSS mirrored (`scaleX(-1)`), and the canvas overlay mirrors landmark X coordinates to match (`1 - landmarks[idx].x`).

## Deployment

- **Frontend** → Netlify (auto-deploys from GitHub, `netlify.toml` handles build + API proxy redirects)
- **Backend** → Fly.io (`fly deploy` from `backend/` directory)
- **Domain** → .tech domain pointed via Cloudflare DNS
- Update `netlify.toml` redirect target if Fly.io app name changes from `vitalsight-api`

## Hackathon Category Targets (12/13)

Overall, Most Technically Impressive, Best Business Plan, Best Social Impact, Best Use of AR, Medpace (clinical trials), Kinetic Vision (synthetic data), MLH Gemini API, MLH ElevenLabs, MLH Presage, MLH Solana, MLH .Tech
