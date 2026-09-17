# Ocho AI — Admin Copilot

An internal tool for Ocho The Agency: a client list with a relationship-health
indicator, a touchpoint timeline, and AI-drafted emails and reports.

## Stack

- **Frontend:** Vite + React, Tailwind CSS (v4), lucide-react icons
- **Backend:** Node.js + Express, talking to the Anthropic API server-side
- **Persistence:** a single JSON file (`server/data/db.json`)
- **Auth:** individual accounts (owner/employee roles), passwords hashed with scrypt, gating a signed session cookie

### Why a JSON file instead of SQLite?

For one user and a client list that'll realistically be dozens-to-low-hundreds
of clients with a handful of notes each, a JSON file is simpler to run, back
up (it's literally one file — copy it, Dropbox it, done), and inspect by eye
if something looks wrong. There's no schema migration story, no native
dependency to compile, nothing to install beyond Node.

The tradeoff: every write rewrites the whole file, and there's no real
querying — the backend just loads it all into memory and filters in JS. That
stops being fine once you have concurrent users, need partial updates on very
large datasets, or want proper querying (e.g. "clients not contacted in 30
days" across thousands of rows). If this ever needs any of that, swap
`server/src/db.js` for `better-sqlite3` — everything that touches storage goes
through `readDb()`/`writeDb()` in that one file, so it's a contained change;
the routes in `server/src/routes/` wouldn't need to change shape, just the
calls they make.

## Project layout

```
ocho-admin-copilot/
  server/            Express API + Anthropic calls + JSON persistence
    src/
      index.js        entry point
      db.js            JSON file read/write
      auth.js          session middleware + requireAuth/requireOwner
      password.js      password hashing (scrypt) + temp-password generation
      anthropicClient.js   Claude API wrapper
      routes/          auth.js, users.js, clients.js, ai.js
    data/db.json       your data (gitignored)
    .env               secrets (gitignored) — copy from .env.example
  client/            Vite + React frontend (the UI you designed)
    src/
      App.jsx          main app (client list, panels, tabs)
      Login.jsx        login screen + first-run setup + forced password change
      api.js           fetch wrapper for the backend
```

## Setup

**Requirements:** Node.js 18+ (you have v22, that's fine).

From this folder:

```bash
npm install
```

This installs both `server` and `client` workspaces in one go.

### Add your secrets

```bash
cp server/.env.example server/.env
```

Then open `server/.env` and fill in:

- `ANTHROPIC_API_KEY` — get one at https://console.anthropic.com/settings/keys.
  Without this, everything works except the "Draft email" / "Generate report"
  buttons, which will show a clear error instead of failing silently.
- `SESSION_SECRET` — any random string, used to sign the login cookie. Generate
  one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` — optional,
  for "Forgot password?" to actually send an email. Without these, the reset
  flow still works end to end, it just tells people to ask their team owner
  instead of emailing them — see **Forgot password**, below.

There's no password to set here anymore — accounts are created inside the app (see **Accounts & team** below).

### Run it

```bash
npm run dev
```

This starts the backend on `http://localhost:3001` and the frontend (with
hot reload) on `http://localhost:5173`. Open **http://localhost:5173**.

The first time it runs with zero accounts, you'll land on a one-time
**"Create your account"** screen instead of a login form — whoever fills
that in becomes the owner. From there, add your sister's team from **Team**
in the sidebar (see below).

### Running it without the dev tooling

To run it as a single process (e.g. so it can just be double-clicked or run
as a background service later) instead of the two-server dev setup:

```bash
npm start
```

This builds the frontend and serves it directly from the Express server —
just `http://localhost:3001`, one process, no Vite. Use `npm run dev` while
you're actively changing code; use `npm start` once you want to just *run*
the thing.

## Accounts & team

- **Everyone shares one client list.** There's no per-employee privacy —
  every account sees every client. What's per-account is *attribution*:
  each note and each AI-generated draft/report is tagged with who created
  it ("Sam · 2 days ago"), so it reads like a shared log rather than an
  anonymous one.
- **Two roles.** `owner` can open **Team** (bottom of the sidebar, owner
  accounts only) to add people, deactivate/reactivate them, and reset a
  forgotten password. `employee` accounts do everything else the same —
  clients, notes, drafts, reports — just without the Team panel.
- **Adding someone:** Team → Add team member → name, email, role. This
  generates a temporary password shown *once* — this isn't emailed to them
  automatically, so copy it and send it to them yourself (Slack, in person,
  whatever). They're forced to set their own password the first time they
  log in with it.
- **Deactivating, not deleting.** There's deliberately no way to delete a
  user — deactivate instead. This keeps their name attached to the notes
  and drafts they created (deleting the account would either orphan that
  history or force deleting it too). A deactivated account can't log in;
  reactivate any time from the same panel.
- **Losing access to the only owner account?** There's no recovery UI for
  that on purpose — edit `server/data/db.json` directly (stop the server
  first), find your user object, and set `"role": "owner"` and
  `"active": true`. Automatic backups in `server/data/backups/` have older
  copies if you need to see what it looked like before.

## Forgot password

"Forgot password?" on the login screen is a real, working flow — not a
placeholder — but what it *does* depends on whether email sending is set up:

- **SMTP configured** (see the env vars above): entering an email sends a
  real reset link, valid for 1 hour. Clicking it opens a "choose a new
  password" screen and logs you straight in afterward.
- **Not configured** (the default, out of the box): the screen tells people
  to ask their team owner to reset their password from **Team** instead —
  the same fallback as before, just reached from a real check instead of a
  hard-coded message.

Either way, the same "don't reveal which emails have accounts" rule applies
as with login: requesting a reset for an email that doesn't exist responds
identically to one that does. If SMTP isn't set up and you (the owner) want
to see a reset link during testing, it's logged to the server's own console
instead of being silently dropped — check whichever terminal is running
`npm run dev` / `npm start`.

Any normal SMTP account works — a personal Gmail with an
[App Password](https://myaccount.google.com/apppasswords) (needs 2-Step
Verification turned on first), a transactional service like Resend or
SendGrid, or a business mailbox. See `server/src/email.js`.

## Reliability features

A few things were added on top of the initial build specifically so real
client data doesn't get lost or exposed carelessly:

- **Soft delete + Trash.** "Delete client" doesn't actually erase anything —
  it's hidden from the main list and moved to **Trash** (bottom-left of the
  sidebar), where you can restore it or permanently delete it. Notes are
  still deleted immediately (with a confirm prompt) since losing one note is
  much lower-stakes than losing a client's whole history.
- **Automatic backups.** Every write to `server/data/db.json` snapshots the
  previous version into `server/data/backups/` first, keeping the most
  recent 50. If something ever goes wrong with the live file, stop the
  server, copy the newest `db-<timestamp>.json` from `backups/` over
  `data/db.json`, and restart.
- **Real error messages.** Failures (network issues, a bad Claude response,
  a validation error) show what actually happened in a toast, instead of a
  single generic "couldn't save" message.
- **Login throttling.** After 5 failed password attempts, login locks out
  for 15 minutes — basic protection against someone guessing the password.
- **Sessions survive restarts.** Logins are stored on disk (`server/data/sessions/`,
  via `session-file-store`) instead of only in server memory. Previously,
  any server restart — including the automatic ones `node --watch` triggers
  every time a backend file changes during development — silently logged
  every user out, and the next thing they clicked would fail with a
  confusing "you've been logged out." That's fixed now; a restart no longer
  drops anyone's session.

## Functionality features

- **Search.** A search box above the client list filters by name or business
  type as you type — fine to skip with a handful of clients, but stops you
  scroll-hunting once the list gets long.
- **Needs-attention view.** A toggle at the top of the client list ("All" /
  "Needs attention") filters down to clients who are amber or red on the
  health dot — the whole point of that indicator, without having to scan the
  sidebar yourself. Paused/churned clients are excluded even if their contact
  gap is large, since you're not actively working them.
- **Draft/report history.** Every generated email draft or report is saved
  to that client automatically (not just held in the tab until you navigate
  away). Past ones show up under "Past drafts" / "Past reports" — click the
  restore icon to load one back into the editor, or delete it if it's just
  noise.
- **Branded PDF report export.** Any report — the one currently in the
  editor, or any past one in history — can be downloaded as a polished,
  Ocho-branded PDF (logo, agency name, the stat breakdown it was generated
  from, the report text, a footer) instead of a plain copy-pasted block of
  text. Built with `@react-pdf/renderer`, entirely client-side — no backend
  involved in generating the PDF itself. See `client/src/ReportPdf.jsx`.
- **Multiple contacts + client status.** A client can have more than one
  contact (owner, property manager, etc., each with an optional role), and
  a status of Active / Paused / Churned. Paused/churned clients sort to the
  bottom of the list and show a badge, so past clients don't crowd out who
  you're actively working with.
- **Billing / retainer tracking.** Each client can have a monthly retainer
  amount, a Current/Overdue status (toggled by hand — there's no payment
  processor wired in), and a renewal date. The dashboard surfaces a
  "Renewals due soon" list (next 30 days) and a "Billing overdue" count, so
  a lapsing contract or an unpaid invoice doesn't just quietly happen.
- **Content calendar.** A per-client "Calendar" tab for planned content —
  title, platform, date, notes — with a one-click "mark as posted." It's a
  simple chronological list rather than a visual month grid for now; easy
  to upgrade later if that's wanted.

## Data model

```
Client {
  id, name, businessType, goals, status, createdBy: { id, name },
  contacts: [{ id, name, role }],
  billing: { monthlyRetainer, status: "current" | "overdue", renewalDate },
  calendar: [{ id, title, platform, date, status: "planned" | "posted", notes }],
  createdAt, updatedAt, deletedAt,
  notes:  [{ id, date, text, updatedAt, author: { id, name } }],
  drafts: [{ id, kind: "email" | "report", purpose, content, stats, createdAt, createdBy: { id, name } }]
}
```

`stats` is only populated for `kind: "report"` drafts — the raw posts/followers/engagement/top-post numbers the report was generated from, kept alongside the prose so a PDF exported later (even much later, from history) can still show the stat breakdown.

```
User {
  id, name, email, role: "owner" | "employee",
  passwordHash, mustChangePassword, active, createdAt
}
```

`passwordHash` never leaves the server — every API response strips it (see `publicUser()` in `server/src/auth.js`).

`deletedAt` is `null` for active clients and set to a timestamp when soft-deleted (see Trash, above).
`status` is one of `active` / `paused` / `churned` (defaults to `active`).

Older client records (from before `contacts`/`status`/`drafts` existed) are
upgraded automatically the moment they're read — `server/src/db.js` backfills
sensible defaults, including turning a legacy single `contactName` string
into a one-person `contacts` array — so there's no migration step to run.

Relationship health is derived, not stored: it's the days since the client's
most recent note, computed on the frontend from `notes[].date`.

## What changed from the prototype

- `window.storage` → real persistence via the Express backend + JSON file
  (`server/src/db.js`), with proper REST routes for clients and notes.
- Direct browser `fetch` to `api.anthropic.com` → routed through
  `POST /api/ai/email` and `POST /api/ai/report`, which call the Anthropic
  SDK server-side (`server/src/anthropicClient.js`). Your API key never
  reaches the browser.
- Added real accounts (owner/employee roles, hashed passwords, session
  cookies) since this will hold real client data and more than one person
  may use it.
- Added edit and delete for both clients and notes (the prototype only
  supported adding).
- Model: uses `claude-opus-5` at "medium" effort — tuned in one place
  (`server/src/anthropicClient.js`) if you want to adjust cost/quality later.

Everything else — the navy/electric-blue design system, the dot-based
relationship indicator, the tab layout, the copy-to-clipboard drafts — is
ported as-is.
