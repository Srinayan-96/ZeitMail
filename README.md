# ZeitMail-Email Scheduler

A production-grade email job scheduler. It lets you upload a list of leads, schedule a bulk email campaign, and have it sent out reliably — with rate limiting, artificial delays between sends, and full crash/restart safety. No cron jobs anywhere.

Built with Express + BullMQ + Redis + PostgreSQL (Prisma) on the backend, and Next.js + Tailwind on the frontend.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Setup: Docker (Redis + Postgres)](#setup-docker-redis--postgres)
4. [Setup: Ethereal Email (fake SMTP)](#setup-ethereal-email-fake-smtp)
5. [Setup: Google OAuth](#setup-google-oauth)
6. [Environment Variables](#environment-variables)
7. [Running the Project](#running-the-project)
8. [Features Implemented](#features-implemented)
9. [How Scheduling & Persistence Work](#how-scheduling--persistence-work)
10. [How Rate Limiting & Concurrency Work](#how-rate-limiting--concurrency-work)
11. [Test Cases](#test-cases)
12. [Assumptions & Trade-offs](#assumptions--trade-offs)

---

## Architecture Overview

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  Next.js UI │ ───► │  Express API │ ───► │  PostgreSQL │
│  (Frontend) │      │  (Backend)   │      │  (Prisma)   │
└─────────────┘      └──────┬───────┘      └─────────────┘
                             │
                      ┌──────▼───────┐
                      │  BullMQ Queue│
                      │  (Redis)     │
                      └──────┬───────┘
                             │
                      ┌──────▼───────┐
                      │  Worker      │
                      │  (sends via  │
                      │  Ethereal)   │
                      └──────────────┘
```

- **Frontend** — Next.js dashboard. Handles Google login, CSV upload, campaign composition, and shows Scheduled/Sent tables.
- **Backend** — Express API that validates requests, writes to Postgres, and enqueues BullMQ delayed jobs.
- **Worker** — A separate BullMQ worker process/thread that picks up jobs, enforces rate limits, applies delays, sends via Ethereal, and updates job status in Postgres.
- **Reconciler** — Runs on backend startup. Scans Postgres for any job that's still `pending`/`processing` but missing from the BullMQ queue (e.g. because Redis got wiped or the server crashed) and re-enqueues it, so nothing is lost or duplicated.

---

## Prerequisites

Make sure you have these installed before doing anything else:

- **Node.js** v18 or higher
- **npm** (comes with Node)
- **Docker Desktop** (for Redis + Postgres) — or have Redis/Postgres installed locally if you'd rather skip Docker
- A **Google account** (for setting up OAuth credentials)
- A free **Ethereal Email** account (created in two seconds, no signup form — see below)

---

## Setup: Docker (Redis + Postgres)

The project ships with a `docker-compose.yml` that spins up Redis and Postgres for you. From the project root:

```bash
docker-compose up -d
```

This will start:
- **Redis** on `localhost:6379`
- **PostgreSQL** on `localhost:5432`

Check both containers are healthy:

```bash
docker ps
```

You should see `redis` and `postgres` listed as `Up`.

If you ever want to wipe Redis clean (useful for testing the restart/reconciliation behavior), you can run:

```bash
docker-compose restart redis
```

To stop everything:

```bash
docker-compose down
```

> If you don't want to use Docker, just install Redis and Postgres locally and update the connection strings in your `.env` accordingly — everything else works the same.

---

## Setup: Ethereal Email (fake SMTP)

Ethereal is a fake SMTP service made for testing — it doesn't actually deliver to real inboxes, but lets you see exactly what was "sent" in a web-based mailbox. No signup required.

1. Go to **https://ethereal.email/create**
2. Click **Create Ethereal Account**. It instantly generates:
   - An SMTP username (looks like an email address)
   - An SMTP password
   - Host: `smtp.ethereal.email`
   - Port: `587`
3. Copy these credentials into your backend `.env` file (see [Environment Variables](#environment-variables)).
4. To view "sent" emails, log in at **https://ethereal.email/login** with the same credentials — every email your worker sends will show up there.

Since the assignment requires support for **multiple senders**, you can repeat this step to generate 2–3 separate Ethereal accounts and register them as senders in the database (see the `Sender` table / seed script).

---

## Setup: Google OAuth

The frontend uses real Google OAuth (via NextAuth.js) — no mock login.

1. Go to the **[Google Cloud Console](https://console.cloud.google.com/)**.
2. Create a new project (or select an existing one).
3. In the left sidebar, go to **APIs & Services → OAuth consent screen**.
   - Choose **External** user type.
   - Fill in the required app name, support email, and developer contact email.
   - Save and continue through the scopes/test users screens (you can add your own Google account as a test user).
4. Go to **APIs & Services → Credentials**.
5. Click **Create Credentials → OAuth Client ID**.
   - Application type: **Web application**
   - Name: anything, e.g. `ReachInbox Scheduler`
   - **Authorized JavaScript origins**: `http://localhost:3000`
   - **Authorized redirect URIs**: `http://localhost:3000/api/auth/callback/google`
6. Click **Create**. Copy the generated **Client ID** and **Client Secret**.
7. Paste them into your frontend `.env` file as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

That's it — once you log in through the app, it'll pull your name, email, and avatar from your actual Google account.

---

## Environment Variables

### `backend/.env`

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/reachinbox"

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379

# Worker config
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR=200

# Ethereal SMTP (default/fallback sender — additional senders can be seeded separately)
ETHEREAL_SMTP_HOST="smtp.ethereal.email"
ETHEREAL_SMTP_PORT=587
ETHEREAL_SMTP_USER="your_generated_ethereal_user"
ETHEREAL_SMTP_PASS="your_generated_ethereal_pass"

# Server
PORT=4000
```

### `frontend/.env.local`

```env
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate_a_random_string_here"
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
NEXT_PUBLIC_API_BASE_URL="http://localhost:4000/api"
```

> Generate a `NEXTAUTH_SECRET` quickly with: `openssl rand -base64 32`

---

## Running the Project

**1. Start infrastructure:**
```bash
docker-compose up -d
```

**2. Backend setup:**
```bash
cd backend
npm install
npx prisma migrate dev
npx prisma db seed        # optional: seeds a default sender
npm run dev               # starts the Express API + reconciler
```

**3. Worker (in a separate terminal):**
```bash
cd backend
npm run worker            # starts the BullMQ worker process
```

**4. Frontend (in a separate terminal):**
```bash
cd frontend
npm install
npm run dev
```

**5. Open the app:**
Visit `http://localhost:3000`, log in with Google, and start scheduling emails.

---

## Features Implemented

### Backend
- ✅ REST API to accept email scheduling requests (subject, body, CSV leads, start time, delay, hourly limit)
- ✅ PostgreSQL persistence via Prisma (`User`, `Sender`, `EmailJob` tables)
- ✅ BullMQ delayed jobs for scheduling — **zero cron jobs** anywhere
- ✅ Configurable worker concurrency via `WORKER_CONCURRENCY`
- ✅ Configurable minimum delay between sends via `MIN_DELAY_BETWEEN_EMAILS_MS`
- ✅ Redis-backed hourly rate limiter, keyed per sender + hour window (`ratelimit:<senderId>:<hourWindow>`)
- ✅ Jobs that exceed the hourly cap are rescheduled into the next hour window instead of failing
- ✅ Idempotency: each `EmailJob` has a unique ID and a status machine (`pending → processing → sent/failed`); a job already in `processing`/`sent` is never re-sent
- ✅ Startup reconciliation: on boot, scans Postgres for pending/processing jobs missing from BullMQ and re-enqueues them
- ✅ Multiple sender support (each with its own Ethereal SMTP credentials and its own rate-limit bucket)
- ✅ Jest test suite covering idempotency and rate-limit logic

### Frontend
- ✅ Real Google OAuth login via NextAuth.js
- ✅ Header showing logged-in user's name, email, avatar, and logout button
- ✅ Dashboard with Scheduled / Sent tabs
- ✅ Compose modal: subject, body, CSV upload (with parsed email count shown), start time, delay, hourly limit
- ✅ Scheduled Emails table with loading and empty states
- ✅ Sent Emails table (status: sent/failed) with loading and empty states
- ✅ Reusable UI components (Button, Input, Table, Modal, Toast)
- ✅ Fully typed API responses and component props with TypeScript

---

## How Scheduling & Persistence Work

1. When a campaign is submitted, the backend creates one `EmailJob` row per recipient in Postgres with status `pending`, and adds a corresponding **BullMQ delayed job** (delay = time until `scheduledFor`).
2. Each `EmailJob`'s ID is used to derive its BullMQ job ID, so the same job can never be enqueued twice.
3. When the worker picks up a job, it first checks the job's current status in Postgres. If it's already `processing` or `sent`, the worker aborts immediately — this is what guarantees idempotency even if BullMQ somehow delivers a job twice.
4. If everything checks out, the worker flips the status to `processing`, sends the email via Ethereal, then flips it to `sent` (or `failed` with an error message).
5. **On server restart:** a reconciler runs at startup, queries Postgres for every job still `pending`/`processing` with a future or near-future `scheduledFor`, and checks whether it exists in the BullMQ/Redis queue. Anything missing (e.g. because Redis was wiped) gets re-enqueued with the correct remaining delay. Nothing restarts from scratch, and nothing gets sent twice.

---

## How Rate Limiting & Concurrency Work

- **Concurrency**: the BullMQ worker is configured with `concurrency: WORKER_CONCURRENCY`, controlling how many jobs it processes in parallel.
- **Minimum delay between sends**: enforced in the worker logic itself — after each send, the worker waits `MIN_DELAY_BETWEEN_EMAILS_MS` before picking up the next job for that sender. This is documented as **2 seconds by default**, configurable via env.
- **Hourly limit**: enforced with a Redis counter keyed by `ratelimit:<senderId>:<hourWindow>`, incremented atomically per send attempt. This works correctly even with multiple worker instances since the counter lives in Redis, not in memory.
- **Overflow behavior**: if a sender has hit its hourly cap, the job is **not failed** — it's moved to the start of the next hour window via `job.moveToDelayed()`, preserving relative order among the delayed jobs.
- **Under load (1000+ jobs at once)**: jobs queue up normally in BullMQ; the rate limiter naturally spreads them across hour windows as each sender's cap is hit, rather than trying to force them all through at once.

---

## Test Cases

All of the following were run manually against the running system (and are also captured in the demo video), plus one automated Jest suite.

### Test Case 1 — Basic Workflow
**Requirement:** Dashboard accepts email requests, parses CSV, and schedules them.

1. Logged in via Google on the frontend.
2. Created a CSV with an `email` column containing 3 addresses.
3. Opened Compose, uploaded the CSV, filled in subject/body, and set the schedule time for 2 minutes out.
4. Set Delay to `0` and Hourly Limit to `100`.
5. Clicked **Send Later**.
6. **Result:** Redirected to the dashboard and saw all 3 emails in the "Scheduled" tab. After 2 minutes, they moved automatically into "Sent." Confirmed delivery by checking the Ethereal inbox.

### Test Case 2 — Throttling / Hourly Rate Limit
**Requirement:** Enforce a per-sender hourly send limit without dropping jobs.

1. Uploaded a CSV with 2 emails.
2. Set Hourly Limit to `1`, schedule time to right now.
3. **Result:** Dashboard showed exactly 1 email in "Sent." The second stayed in "Scheduled." Backend logs confirmed it hit the cap and was pushed to run at the start of the next hour window — no job was lost or failed.

### Test Case 3 — Artificial Delay Between Sends
**Requirement:** Add a configurable pause between consecutive sends.

1. Uploaded a CSV with 3 emails.
2. Set Delay Between Emails to `5000` (5 seconds), schedule time to right now.
3. **Result:** Backend terminal showed Email #1 processed, a 5-second sleep, Email #2 processed, another 5-second sleep, then Email #3 — sent one at a time with a clear pause between each.

### Test Case 4 — Server Restart & Idempotency (the big one)
**Requirement:** No lost or duplicated jobs across a crash/restart; queue survives even if Redis is wiped.

1. Scheduled 10 emails for 5 minutes in the future — confirmed all 10 appeared in "Scheduled" on the frontend.
2. Killed the backend with `Ctrl+C` mid-wait.
3. Ran `docker-compose restart redis` to simulate total loss of the BullMQ queue state.
4. Restarted the backend with `npm run dev`.
5. **Result:** The reconciler kicked in immediately on boot, scanned Postgres, found the 10 jobs still `pending` with no matching entry in BullMQ, and re-enqueued all of them with the correct remaining delay. All 10 sent exactly at their scheduled time — no duplicates, nothing lost.

### Test Case 5 — Automated Test Suite
**Requirement:** Automated coverage of idempotency logic.

1. From `backend`, ran `npm run test`.
2. **Result:** Jest suite passed — it mocks the database layer and verifies that if a job's status is already `processing` or `sent`, the worker safely aborts the duplicate attempt instead of sending again. Also covers the rate-limiter's reschedule behavior when the hourly cap is hit.

---

## Assumptions & Trade-offs

- Assumed the CSV upload only needs a single `email` column — no additional per-recipient personalization fields were required by the spec, so none were added.
- Ethereal Email accounts expire/reset periodically since it's a testing service — if the demo video is recorded much later than setup, SMTP credentials may need to be regenerated.
- Used a plain `<textarea>` for the email body instead of a full rich text editor, to keep the compose flow simple and reliable within the 24-hour window — content is sent as plain text/basic HTML.
- Rate limiting is enforced **per sender**, not globally, since the assignment requires supporting multiple senders — each sender has its own independent hourly budget.
- The reconciliation check runs once at startup rather than continuously; this is sufficient because BullMQ + Postgres together are the source of truth, and no job can silently disappear from Postgres.
- For local development, Redis and Postgres are run via Docker for convenience — the app works identically against locally installed instances if you update the `.env` connection strings.
