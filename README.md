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
- `PRESAGE_BRIDGE_MODE=mock` if you are using the bundled local bridge as-is
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
- the bundled `presage-bridge` runs in mock mode for local end-to-end demos
- the backend is structured to forward captured frames to a real Presage bridge when available
- Gemini, ElevenLabs, Solana, and B2 are optional integrations layered on top of the measurement flow

## Security and privacy touches

- JWT auth stored in HTTP-only cookies
- SameSite handling for same-origin and cross-origin setups
- role-protected routes on both client and server
- rate limiting on auth and expensive API calls
- security headers for content type, framing, referrer policy, permissions policy, and HSTS when applicable
- patient profile preferences for reminders
- account deletion paths for both patients and coordinators

## Deployment

The app is set up for a single Fly.io deployment using the included `Dockerfile` and `deploy.sh`. The frontend is built first, copied into the backend `public/` directory, and then served by Express alongside the API.

## Devpost draft

The current Devpost skeleton lives in [DEVPOST.md](/Users/jazmo/Documents/GitHub/kneecap%20exploder%209000/DEVPOST.md).
