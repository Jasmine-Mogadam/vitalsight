# VitalSight

VitalSight is a full-stack platform for decentralized clinical trial operations. It helps coordinators recruit and manage participants, lets patients discover or join studies, supports scheduled study forms and inbox notifications, and includes a contactless vitals monitoring experience powered by webcam capture, AI analysis, and an auditable storage pipeline.

## What the app does today

- Coordinator authentication with trial creation and management
- Patient authentication with optional onboarding profile
- Public trial discovery with filters, compensation metadata, and application windows
- Private invite-only trial links with reusable or limited-use tokens
- Patient join requests and coordinator approval workflows
- Trial-specific form builder with recurring schedules
- Patient form completion flows and submission storage
- Inbox messaging for join requests, approvals, reminders, and trial events
- Email reminders for scheduled forms when SMTP is configured
- Profile editing, notification preferences, and account deletion flows
- Session recovery modal for expired auth while preserving in-progress work
- Contactless vitals monitor page with AR face overlay and Presage bridge integration
- AI-generated vitals summary via Gemini, voice playback via ElevenLabs, hash logging to Solana devnet, and vitals JSON storage in Backblaze B2

## Stack

- Frontend: React 19, Vite, React Router
- Backend: Express 5, better-sqlite3, JWT cookie auth
- Scheduling: node-cron
- Email: Nodemailer
- AI and integrations: Gemini, ElevenLabs, Presage bridge, Solana, Backblaze B2, Geoapify
- Deployment: Docker + Fly.io

## Project structure

```text
frontend/               React SPA for landing, auth, dashboard, discovery, forms, inbox, profile, and monitor
backend/                Express API, SQLite data layer, auth/session helpers, route modules, scheduler, seed script
presage-bridge/         Local bridge service for Presage-style measurement requests (mock mode included)
Dockerfile              Multi-stage build for frontend + backend deployment
fly.toml                Fly.io configuration
CLAUDE.md               Repo notes and implementation map for future contributors/agents
DEVPOST.md              Current Devpost writeup draft
```

## Routes and capabilities

### Frontend

- `/` landing page
- `/register`, `/login` role-based auth
- `/onboarding` optional patient profile setup
- `/dashboard` coordinator or patient workspace
- `/discover` public trial search
- `/discover/:id` trial details
- `/join/:token` private invite redemption
- `/trials/:id` coordinator trial management
- `/trials/:id/forms` coordinator form builder
- `/forms/:id/fill` patient form completion
- `/inbox` role-aware notifications
- `/profile` patient profile and deletion controls
- `/monitor` webcam vitals experience
- `/business-plan`, `/social-impact` hackathon presentation pages

### Backend API

- `/api/auth/*` register, login, logout, session, delete account
- `/api/trials/*` discovery, creation, update, invites, join requests, enrollment approvals
- `/api/forms/*` CRUD, schedules, submissions
- `/api/patients/*` profile and notification preferences
- `/api/inbox/*` messages, unread counts, read/delete actions
- `/api/presage/*` bridge status and vitals measurement
- `/api/locations/search` Geoapify-powered autocomplete
- `/api/analyze` Gemini vitals summary
- `/api/speak` ElevenLabs text-to-speech
- `/api/log-vitals` Solana memo logging
- `/api/store-vitals` Backblaze B2 persistence

## Local development

From the repo root:

```bash
npm run install:all
npm run seed
npm run dev
```

This starts:

- frontend on `http://localhost:5173`
- backend on `http://localhost:3001`
- Presage bridge on `http://127.0.0.1:8787`

Other useful commands:

```bash
npm run build
npm run deploy
cd frontend && npm run lint
cd backend && npm run seed
```

## Environment setup

Copy the backend template and fill in the values you want enabled:

```bash
cp backend/.env.example backend/.env
```

Important variables:

- `JWT_SECRET` required, minimum 32 characters
- `FRONTEND_ORIGIN` or `FRONTEND_ORIGINS` for allowed browser origins
- `GEMINI_API_KEY` for `/api/analyze`
- `ELEVENLABS_API_KEY` and optional `ELEVENLABS_VOICE_ID` for `/api/speak`
- `SOLANA_PRIVATE_KEY` for `/api/log-vitals`
- `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET_ID` for `/api/store-vitals`
- `PRESAGE_API_KEY`, `PRESAGE_BRIDGE_URL`, `PRESAGE_TIMEOUT_MS` for live bridge mode
- `PRESAGE_BRIDGE_MODE=mock` for generated vitals or `PRESAGE_BRIDGE_MODE=sdk` to launch the bundled SmartSpectra native runner
- `PRESAGE_SDK_*` variables configure the local camera-backed SmartSpectra runner in `sdk` mode
- `GEOAPIFY_API_KEY` for location autocomplete
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` for reminder emails

## Seed data

`npm run seed` resets the SQLite database and loads demo data for:

- coordinators
- patients
- public and private trials
- invite links
- enrollments in multiple states
- scheduled forms
- example submissions
- inbox messages

This makes it easy to demo both coordinator and patient flows without hand-entering data.

## Notes on the monitor flow

The monitor experience is intentionally hybrid:

- MediaPipe Face Mesh drives the browser AR overlay
- the monitor can fall back to simulated demo vitals
- the bundled `presage-bridge` can run in mock mode or launch a local SmartSpectra SDK worker
- in `sdk` mode the bridge serves the latest local camera metrics over the same `/measure` API used by the backend
- in local Vite dev, the monitor now records a short browser clip and sends it to the bridge for a SmartSpectra spot measurement when live camera polling is not practical on macOS
- Gemini, ElevenLabs, Solana, and B2 are optional integrations layered on top of the measurement flow

### Building the native Presage bridge

The SDK-backed bridge expects a compiled runner at `presage-bridge/native/build/smartspectra_bridge`.

```bash
npm run build:presage-bridge
```

If CMake cannot find the SmartSpectra SDK, point it at the installed package first:

```bash
SMARTSPECTRA_DIR=/path/to/dir-containing-SmartSpectraConfig.cmake npm run build:presage-bridge
```

or:

```bash
CMAKE_PREFIX_PATH=/path/to/sdk/prefix npm run build:presage-bridge
```

Then set:

```bash
PRESAGE_BRIDGE_MODE=sdk
PRESAGE_BRIDGE_URL=http://127.0.0.1:8787
```

The Node bridge will start the native worker automatically and expose the same `GET /health` and `POST /measure` endpoints the backend already uses.

### macOS local dev

On macOS, `npm run dev` now starts the Presage bridge in an Ubuntu Docker container by default. That container installs `libsmartspectra-dev`, builds the native runner, and exposes the bridge on `http://127.0.0.1:8787`.

Requirements:

- Docker Desktop running
- `backend/.env` present with `PRESAGE_BRIDGE_MODE=sdk`

Useful commands:

```bash
npm run build:presage-bridge:docker
npm run dev
npm run stop:presage-bridge
```

If you ever want to run the bridge directly on the host instead, use:

```bash
npm run dev:presage-bridge:host
```

## Security and privacy touches

- JWT auth stored in HTTP-only cookies
- SameSite handling for same-origin and cross-origin setups
- role-protected routes on both client and server
- rate limiting on auth and expensive API calls
- security headers for content type, framing, referrer policy, permissions policy, and HSTS when applicable
- patient profile preferences for reminders
- account deletion paths for both patients and coordinators

## Deployment

The app is set up for a single Fly.io deployment using the included `Dockerfile` and `deploy.sh`.

For Fly specifically, the root `Dockerfile` now uses Ubuntu, installs `libsmartspectra-dev`, builds `presage-bridge/native/build/smartspectra_bridge`, and starts both:

- Presage bridge on `127.0.0.1:8787`
- backend API on `0.0.0.0:3001`

The backend is configured to call the in-container bridge (`PRESAGE_BRIDGE_URL=http://127.0.0.1:8787`). In production, video clip uploads to `/api/presage/measure` are enabled by default (`PRESAGE_ALLOW_VIDEO_UPLOAD_IN_PRODUCTION=true`) so Fly can run SDK spot measurements even when image polling is unavailable.

## Devpost draft

The current Devpost skeleton lives in [DEVPOST.md](/Users/jazmo/Documents/GitHub/kneecap%20exploder%209000/DEVPOST.md).
