# SmartGate – Smart Hostel Leave Management System with QR Pass Generator

SmartGate is a full-stack MERN (MongoDB, Mongoose, Express, React, TypeScript, Vite, Tailwind CSS) campus hostel leave governance platform featuring 10 role-based dashboards, conditional HOD approval routing, direct AO emergency clearances, standard and late leave extensions, a cryptographic QR Pass Generator, a Security Guard QR Scanner, digital gate exit/return logging, overdue detection, and consent-based Leaflet/OpenStreetMap location sharing.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, React Router DOM, Lucide Icons, Recharts, `html5-qrcode`, Leaflet + OpenStreetMap
- **Backend:** Node.js, Express.js, REST APIs, Multer (supporting document uploads)
- **Database:** MongoDB + Mongoose (connects to `MONGODB_URI`; local development can launch a persistent MongoDB engine in `.mongodb-data/` when it is unset)
- **Security & QR:** JWT authentication, `bcryptjs` password hashing, HMAC-SHA256 signed QR verification tokens via `qrcode`, strict backend & frontend Role-Based Access Control (RBAC)

## Implemented Workflows

1. **Regular Leave Workflow:**
   `Student -> Coordinator -> Mentor -> Conditional HOD (>5 approved regular days in semester) -> SWO -> Warden -> QR Pass Generation`
   - Calculates approved regular leave days in the current semester from MongoDB records.
   - Merges overlapping date intervals to prevent double-counting.
   - Excludes pending, rejected, and emergency leaves from the day count.
   - Skips HOD automatically when approved days are `<= 5`; mandates HOD approval when `> 5`.

2. **Emergency Leave Workflow:**
   `Student -> AO -> Approval / Rejection -> QR Pass Generation`
   - Bypasses Coordinator, Mentor, HOD, SWO, and Warden queues.
   - Notifies SWO, Warden, and Emergency Control Centre for informational visibility.

3. **Leave Extension & Late Extension Workflow:**
   - **Regular Extensions:** `Student -> SWO -> Warden -> Updated QR Pass`
   - **Emergency Extensions:** `Student -> AO -> Updated QR Pass`
   - Original approved dates remain unchanged while pending.
   - Prevents duplicate pending extensions for the same leave.
   - Submissions after the original return deadline are flagged as `LATE_EXTENSION_REQUEST`.
   - Final extension approval revokes the old QR pass and generates a replacement QR pass.

4. **QR Pass Generator & Security Gate Control:**
   - Printable official QR Gate Pass with SmartGate logo, college name, student info, validity window, PNG download, and print layout.
   - Live camera QR scanner (`html5-qrcode`) plus QR image upload and manual Pass ID verification fallback.
   - Digital gate exit and return recording preventing duplicate exits/returns, plus authorized late-return exceptions (`RETURNED_LATE`) for overdue students.

## Environment Setup

Copy `.env.example` to `.env` and configure secrets as needed:

```bash
cp .env.example .env
```

For a combined deployment where Express serves both the frontend and API, the frontend uses the same-origin `/api` path by default. For separate frontend and backend deployments:

- Set the frontend **build-time** `VITE_API_BASE_URL` to the deployed backend origin only (scheme and host, no `/api` path and never `localhost`).
- Set backend **runtime** `CORS_ORIGINS` to the exact frontend origin(s), comma-separated (scheme and host, no path).
- Set backend `PORT` to the port supplied by the hosting platform. The server binds to `0.0.0.0`.
- Set backend `MONGODB_URI`, `JWT_SECRET`, and `QR_SIGNING_SECRET`. Production startup fails if these are missing; keep them server-side and never put them in `VITE_*` variables.

The health checks are `GET /health` and `GET /api/health`; both verify database connectivity and return HTTP 503 when it is unavailable. CORS preflight permits GET, HEAD, POST, PUT, PATCH, DELETE, and OPTIONS with `Content-Type` and `Authorization` headers.

## First System Admin Account

System Admin cannot register publicly. To provision the first admin, stop the server when using the embedded local database, set `BOOTSTRAP_ADMIN_EMAIL` and a unique strong `BOOTSTRAP_ADMIN_PASSWORD` in the backend environment, then run `npm run provision-admin` once. The command hashes the password, records an audit event, and refuses to run if an admin already exists. Clear the bootstrap variables after successful provisioning, then start the app with `npm run dev`. For a managed MongoDB deployment, set the backend-only `MONGODB_URI` before running the command.

The optional empty-database demo seed now requires separate, strong `SEED_ADMIN_*` and `DEMO_SEED_PASSWORD` values; it no longer falls back to known passwords.

## Direct Account Registration

Student and public staff/authority registrations now create the account and role profile as `ACTIVE`; successful registration returns only after persistence and audit logging succeed. Users can sign in immediately, and the backend-assigned role selects their dashboard. System Admin remains unavailable through public registration.

For an existing database, stop the server, back up the database, and run `npm run migrate:phones` once. The migration normalizes existing account phone numbers and creates a unique sparse index. It checks for duplicate normalized numbers first and makes no changes if duplicates need resolving. New empty databases need no backfill. Existing registration requests are preserved as legacy records and are no longer created by public registration.

## Running the Application

```bash
# Install dependencies
npm install

# Run full-stack development server (Express API + Vite frontend on port 3000)
npm run dev

# Build frontend for production
npm run build

# Start production server
npm start
```

## Optional Demo Seed Data

For local development only, `npm run seed` can populate an empty database with sample users and workflow scenarios. Set `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, and `DEMO_SEED_PASSWORD` in the backend environment first; both passwords must be strong, distinct values. The demo seed has no default credentials and should not be used in production. For normal installations, provision the first administrator with `npm run provision-admin` instead.
