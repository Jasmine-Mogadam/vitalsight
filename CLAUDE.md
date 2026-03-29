# VitalSight — Current Repo Notes

VitalSight is no longer just the original hackathon monitor demo. The repo now contains a broader decentralized clinical trial workflow app with coordinator and patient experiences, scheduled study forms, private invites, inbox notifications, patient-controlled profile data, session recovery, and a webcam monitor flow that can operate in demo mode or through a Presage-compatible bridge.

## High-level architecture

```text
frontend/               React + Vite SPA
backend/                Express API + SQLite database
presage-bridge/         Local measurement bridge service (mock mode included)
Dockerfile              Multi-stage build for Fly.io deployment
fly.toml                Fly.io app config
deploy.sh               Deployment helper
README.md               Main project documentation
DEVPOST.md              Devpost copy draft
```

## Frontend structure

```text
frontend/src/App.jsx                            Router shell
frontend/src/contexts/AuthContext.jsx           Auth state, session refresh, recovery modal wiring
frontend/src/components/Landing.jsx             Marketing / product landing page
frontend/src/components/Login.jsx               Login flow
frontend/src/components/Register.jsx            Registration flow for patient/coordinator roles
frontend/src/components/PatientOnboarding.jsx   Optional patient setup after registration
frontend/src/components/Dashboard.jsx           Role-aware dashboard
frontend/src/components/DiscoveryTab.jsx        Public trial discovery and filtering
frontend/src/components/TrialDetails.jsx        Public trial detail view
frontend/src/components/JoinTrial.jsx           Invite-token join flow
frontend/src/components/TrialManagement.jsx     Coordinator trial editing, invites, enrollment actions
frontend/src/components/FormBuilder.jsx         Coordinator form builder + schedules + unsaved-work guards
frontend/src/components/FormFill.jsx            Patient form completion
frontend/src/components/Inbox.jsx               In-app message center
frontend/src/components/Profile.jsx             Patient profile and notification settings
frontend/src/components/SessionRecoveryDialog.jsx Reauth modal for expired sessions
frontend/src/components/LocationAutocomplete.jsx Geoapify-backed location search UI
frontend/src/pages/MonitorPage.jsx              Webcam AR vitals monitor
frontend/src/pages/BusinessPlanPage.jsx         Hackathon business plan page
frontend/src/pages/SocialImpactPage.jsx         Hackathon social impact page
frontend/src/lib/api.js                         Fetch wrapper, auth recovery handling
frontend/src/lib/trialCompensation.js           Trial compensation labels/helpers
```

## Backend structure

```text
backend/index.js                    App bootstrap, security headers, CORS, static serving, API mounting
backend/db.js                       SQLite schema, migrations, helpers, message creation, profile helpers
backend/routes/auth.js              Register/login/logout/session/account deletion
backend/routes/trials.js            Discovery, CRUD, invites, joins, enrollment approvals
backend/routes/forms.js             Form CRUD, schedules, submissions
backend/routes/patients.js          Patient profile + notification preferences
backend/routes/inbox.js             Inbox list, unread count, read/delete actions
backend/routes/presage.js           Bridge status + measurement endpoint
backend/services/scheduler.js       Hourly scheduled reminder sweep
backend/services/email.js           SMTP mail transport wrapper
backend/services/presage.js         Presage bridge client + payload normalization
backend/lib/authSession.js          JWT cookie issuance + refresh helpers
backend/config/security.js          JWT secret validation
backend/middleware/auth.js          Optional/required/role auth gates
backend/middleware/rateLimit.js     Auth and expensive endpoint throttling
backend/scripts/seed.cjs            Demo reset + seed data
backend/scripts/dev.cjs             Local backend dev launcher
```

## Current product behavior

### Coordinator flows

- create and edit trials
- set compensation type, payment structure, dates, and privacy mode
- review pending join requests and approve or reject them
- generate private invite links with optional prefill and usage limits
- build and edit forms attached to a trial
- add weekly, monthly, or specific-date schedules
- review participant rosters and study state from the dashboard

### Patient flows

- register as a patient and optionally complete onboarding
- discover public trials and request to join
- open invite links for private trials
- edit ethnicity, location, conditions, and notification preferences
- complete approved trial forms
- view inbox reminders and trial-related messages
- delete account and associated data

### Monitor and integrations

- browser webcam capture with MediaPipe-based AR face overlay
- demo vitals fallback when live measurement is unavailable
- Presage bridge status check and `/api/presage/measure` integration
- Gemini-generated vitals summary via `/api/analyze`
- ElevenLabs voice playback via `/api/speak`
- Solana devnet memo logging via `/api/log-vitals`
- Backblaze B2 vitals JSON storage via `/api/store-vitals`

## Commands

From the repo root:

```bash
npm run install:all     # install frontend and backend dependencies
npm run seed            # reset and seed the SQLite database with demo data
npm run dev             # run frontend, backend, and local Presage bridge together
npm run build           # build the frontend
npm run deploy          # deploy via Fly.io helper script
```

Useful direct commands:

```bash
cd frontend && npm run lint
cd frontend && npm run build
cd backend && npm run dev
cd backend && npm run seed
node presage-bridge/server.cjs
```

## Environment notes

Primary config lives in `backend/.env`.

Required or important values:

- `JWT_SECRET` must exist and be at least 32 chars
- `FRONTEND_ORIGIN` or `FRONTEND_ORIGINS` controls allowed browser origins
- `GEMINI_API_KEY` enables vitals analysis
- `ELEVENLABS_API_KEY` enables voice synthesis
- `SOLANA_PRIVATE_KEY` enables memo logging on devnet
- `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET_ID` enable vitals storage
- `PRESAGE_API_KEY` and `PRESAGE_BRIDGE_URL` enable live bridge measurement
- `PRESAGE_BRIDGE_MODE=mock` uses generated vitals, while `PRESAGE_BRIDGE_MODE=sdk` launches the bundled native SmartSpectra runner
- `PRESAGE_SDK_*` variables configure the local camera-backed SmartSpectra worker
- on macOS local dev, the default `npm run dev` path now runs the Presage bridge in Docker via `npm run dev:presage-bridge`
- `GEOAPIFY_API_KEY` enables location autocomplete
- `SMTP_*` values enable reminder email delivery

## Data model highlights

SQLite tables currently include:

- `users`
- `patient_profiles`
- `coordinator_profiles`
- `trials`
- `trial_invites`
- `trial_enrollments`
- `forms`
- `form_schedules`
- `form_submissions`
- `messages`

Notable recent evolutions reflected in the schema:

- patient age was removed in favor of `date_of_birth`
- trials gained `compensation_type`, `payment_structure`, `compensation_details`, `start_date`, and `applications_close_at`
- inbox messaging is part of core product flow, not just demo filler

## Implementation details worth remembering

- Auth is cookie-based, not localStorage-based
- session recovery is intentionally built into the frontend fetch layer and auth context
- the scheduler runs hourly and creates both inbox items and optional emails
- the bundled Presage bridge now supports `mock` mode and an `sdk` mode that launches a local SmartSpectra worker and serves its latest metrics over HTTP
- local Vite dev can use recorded browser clips for spot measurements while production keeps the existing streaming-oriented path
- the landing page and docs now describe VitalSight as a clinical trial operations platform, not only an AR vitals monitor
- the top-level README and `DEVPOST.md` are now the best quick-reference docs for external readers
