# VitalSight Devpost Draft

## Inspiration
Clinical trials often break down long before the science does. Smaller research teams struggle to recruit the right participants, keep them engaged over time, collect routine follow-up data consistently, and do all of that without building a giant custom operations stack. At the same time, patients are asked to juggle study invites, repetitive forms, and check-ins across fragmented tools.

We built VitalSight to make decentralized clinical trials feel manageable for both sides. The idea was to combine recruitment, enrollment, communication, scheduled reporting, and contactless vitals capture into one privacy-aware workflow that a lean study team could actually run.

## What it does
VitalSight is a full-stack clinical trial operations platform with separate coordinator and patient experiences.

For coordinators, it supports creating trials, defining compensation details, setting application windows, reviewing join requests, approving participants, generating private invite links, building study forms, and scheduling recurring reminders.

For patients, it supports discovering public trials, joining invite-only trials, completing onboarding details, managing profile and notification preferences, filling out assigned forms, and keeping up with study activity through an inbox.

On top of the operations layer, VitalSight includes a webcam-based monitoring page that overlays vitals in AR, can measure through a Presage-compatible bridge, falls back gracefully to demo vitals, summarizes readings with Gemini, speaks results with ElevenLabs, logs a vitals hash to Solana devnet, and stores vitals payloads in Backblaze B2.

## How we built it
We built the frontend as a React + Vite single-page app with React Router and role-aware protected routes. The UI is split into dedicated pages and components for landing, auth, onboarding, dashboard, trial discovery, trial management, form building, form filling, inbox, profile management, and the vitals monitor.

The backend is an Express 5 API with route modules for auth, trials, forms, patients, inbox, and Presage measurement. We used SQLite with `better-sqlite3` for a simple deployable data layer and added a seed script so the full demo can be reset quickly.

For scheduling, we added a cron-based reminder service that creates in-app messages and optionally sends email reminders through SMTP. Authentication uses JWTs in HTTP-only cookies, with background refresh and a session recovery flow in the frontend so users can reauthenticate without losing work.

For the monitor pipeline, the browser handles webcam capture and AR face overlays, the backend can call Gemini and ElevenLabs for interpretation and playback, and a separate local bridge service stands in for Presage integration. We also wired optional persistence and audit layers through Backblaze B2 and Solana memos.

## Challenges we ran into
One major challenge was balancing ambition with honesty in the monitor stack. We wanted a credible contactless vitals story, but browser-native access to specialized physiology tooling is limited, so we had to design a bridge-based architecture that could demo end-to-end locally while still leaving a clean path to a real measurement provider.

Another challenge was product scope. The project started closer to a hackathon demo, but it grew into a fuller workflow app with authentication, onboarding, invitations, enrollment states, recurring schedules, inbox messaging, and data deletion flows. Keeping that expansion coherent without losing the original story took real iteration.

We also ran into the usual full-stack friction points: coordinating auth between frontend and backend, handling protected role-based routes cleanly, managing SQLite schema evolution, and making sure form-builder UX stayed usable even as scheduling rules got more complex.

## Accomplishments that we're proud of
We are proud that VitalSight is no longer just a flashy vitals demo. It now works as a more complete decentralized trial workflow with both coordinator and patient journeys.

We are also proud of the architecture decisions that make the project demo-friendly without painting us into a corner. The bundled seed data, mockable Presage bridge, graceful demo fallback, and single-command local startup make it easy to show the product end to end.

On top of that, we’re proud of the quality-of-life touches: invite links, compensation-aware trial discovery, scheduled reminders, inbox notifications, session recovery, privacy-aware profile controls, and account deletion flows.

## What we learned
We learned that the operational side of healthcare tools is just as important as the headline AI feature. Recruitment, reminders, approval workflows, and retention mechanics matter a lot if you want a trial platform to be useful in practice.

We also learned how valuable it is to design integrations as layers instead of hard dependencies. By making Gemini, ElevenLabs, Solana, B2, SMTP, and the Presage bridge optional, we kept the app resilient and demoable even when individual services are unavailable.

Finally, we learned that privacy and trust show up in product details. Clear role separation, minimal profile fields, notification controls, and explicit deletion paths do a lot to make the system feel safer and more respectful to users.

## What's next for VitalSight
Next, we want to replace the mock bridge path with a production-grade Presage integration, expand the monitor into longitudinal trend views instead of single-session snapshots, and connect vitals and form submissions into one coordinator-facing trial timeline.

We also want to improve trial matching, support richer coordinator profiles and study configuration, add stronger analytics around retention and form adherence, and harden the notification system with delivery tracking and escalation logic.

Longer term, we see VitalSight becoming a lightweight operating system for decentralized studies: recruitment, remote check-ins, patient communication, passive monitoring, and auditable data handling in one place.
