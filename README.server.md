# Afghan Medical Diaspora — Backend Runbook

This folder (`server/`) is the **Node.js Express backend** that:

1. Serves the whole static website (all 9 HTML pages, CSS, JS, images) on one port
2. Saves **Join the Network** registrations and **Contact form** messages to a database
3. Sends real emails (SMTP) — both a friendly confirmation to the submitter and a notification to the organisation inbox

---

## 1. Install & run — first time

Run these commands from a terminal inside **the project root folder**
(`e:\Projects\Afghan Medical Diaspora\`):

```bash
cd server
npm install
cd ..

# Make a real .env file (copy template + then edit it)
copy .env.example .env

# Now EDIT the new file `.env` in the project root — fill real SMTP + email values.

# Start the server:
node server/index.js
```

Open **http://localhost:3000** in a browser.

During development, auto-reload on file changes: `cd server && npm run dev`.

### When server boots, it will print:
```
AMD server listening on http://localhost:3000
Database connected (better-sqlite3)
Database migrations applied — OK
SMTP — verify OK, ready to send email
```
If SMTP credentials are missing/invalid, the server still starts — it just prints
a big warning "SMTP VERIFY FAILED: ... submissions are saved to DB but email will be queued locally".

No submission is ever silently lost. If email fails, a copy is written to `data/email-failures/<timestamp>.json`
and can be re-sent later.

---

## 2. Fill in `.env` — the one file to edit

Copy `.env.example` → `.env` (project root) and fill the sections below.
Only 3 sections actually need real values (SMTP + org email addresses). The defaults
for everything else are fine.

### A. SMTP credentials — the most important part

**Gmail (personal / work Google Workspace)**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx     # 16-char "App Password", NOT your main password
# Get an App Password: myaccount.google.com → Security → 2-Step Verification → App passwords
```

**Your domain mailbox (cPanel / Plesk / Namecheap / Siteground / Ionos / Hetzner)**
```
SMTP_HOST=mail.afghanmedicaldiaspora.org   # or the hostname from your hoster
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=join@afghanmedicaldiaspora.org
SMTP_PASS=the-mailbox-password
```

**Outlook / Microsoft 365**
```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false      # false = uses STARTTLS on 587
SMTP_USER=you@yourdomain.com
SMTP_PASS=your-password
```

### B. Organisation notification addresses

```
MAIL_FROM_NAME="Afghan Medical Diaspora"
MAIL_FROM_ADDRESS=join@afghanmedicaldiaspora.org
MAIL_REPLY_TO=join@afghanmedicaldiaspora.org

# Main mailbox (the "company email" you asked for)
ORG_NOTIFY_EMAIL=info@afghanmedicaldiaspora.org

# Optional second person who also gets a copy — leave blank to disable
ORG_NOTIFY_CC=coordinator@afghanmedicaldiaspora.org
```

### C. Leave `SEND_*` toggles as `true` unless debugging.

---

## 3. Database — switch from default SQLite → PostgreSQL / MySQL

Out of the box we use a **local SQLite database file** at `data/app.db`.
Zero setup, just works. You can open `data/app.db` with any free SQLite GUI
(DB Browser for SQLite, DBeaver, TablePlus, etc.) to browse submissions.

Want a real server-based DB later? Change **two lines in `.env`** and restart the server.
All the database tables/columns are identical across all three databases.

### Option A — PostgreSQL (render.com / supabase / any VPS)
```
DB_CLIENT=pg
DATABASE_URL=postgres://user:password@host:5432/afghan_medical_diaspora
# comment out DB_FILENAME if using Postgres/MySQL
```

### Option B — MySQL / MariaDB (many cPanel hostings give you this free)
```
DB_CLIENT=mysql2
DATABASE_URL=mysql2://user:password@host:3306/afghan_medical_diaspora
```

Restart the server after changing any `.env` value. Tables auto-create on first run.

### View latest submissions quick
From project root:
```
node server/scripts/show-last-submissions.js
```
This prints the last 10 Join registrations + last 10 Contact messages.

---

## 4. How emails are sent on each form submit

| Event | Email 1 — to submitter | Email 2 — to your organisation |
|---|---|---|
| **Join form submitted** | Friendly confirmation: "Thanks — your profile has been received. We'll be in touch as the program develops." (includes their name + role for transparency) | Full copy of their submission (all profile fields, interests, locations, notes) + admin view with internal id + timestamp. Sent to `ORG_NOTIFY_EMAIL` and CC'd to `ORG_NOTIFY_CC` if set. |
| **Contact form submitted** | Friendly confirmation: "Thanks for your message — we have it and will reply to `you@email.com` within a few working days." | Full copy of the message (name, org, topic, message body). Sent to `ORG_NOTIFY_EMAIL` + optional CC. |

All emails are multipart: a plain-text fallback for old email clients and
a simple branded HTML version matching the site's medical-teal palette.

---

## 5. Deploying (options from simplest)

Because we added a Node backend, the site is no longer a pure static site
(although static hosting + serverless functions is possible later).

### Easiest for non-engineers: **Render.com** (≈ $0 to $7/month)
1. Push the whole project (9 HTML + `server/`) to GitHub / GitLab
2. New → Web Service → connect the repo
3. Build Command: `cd server && npm install`
4. Start Command: `node server/index.js`
5. Paste the contents of `.env` into Render → Environment variables
6. For SQLite on Render, choose "Add Disk" (1GB is plenty) at `data/`. Without a disk the SQLite DB resets each deploy.

### A VPS you control: Hetzner / DigitalOcean / Contabo ($5–$12/mo)
Upload the project, `npm install`, run `node server/index.js` under `pm2`
(process manager). Point a domain + add SSL with Caddy / Nginx. Standard VPS setup.

### Static + serverless fallback (Netlify / Vercel)
If you later want to go back to static hosting, the two POST endpoints
(`/api/join` and `/api/contact`) can become Netlify Functions (file rename to
`netlify/functions/join.mjs` etc.) — same logic, same validation, same mailer,
different entry point. Ask when you want that migration.

---

## 6. Spam & abuse protection already built in

- **Rate limit:** 60 submissions per IP per hour on `/api/*`. Tunable in `server/index.js`.
- **Honeypot field:** Each form has a hidden `<input name="website" tabindex="-1" autocomplete="off">` (visually hidden, not labelled). Spam bots fill it. If it's filled, we return HTTP 200 (lie to the bot) but skip database save + email.
- **Server-side required validation:** Even if someone bypasses browser JS and posts directly, the API re-checks every required field + email format + max lengths and returns per-field errors (`{ errors: { firstName: 'Required' } }`).
- **Helmet:** Sets ~12 HTTP security headers (no Sniff, XSS, frame-guard, CSP non-strict for form-post etc.)
- **CORS:** Same-origin by default — can add `CORS_ORIGIN=https://afghanmedicaldiaspora.org` env later.

---

## 7. File layout — what we added to the repo

```
project-root/
├─ server/
│  ├─ index.js                     # Express app start / static host / API mount
│  ├─ package.json                 # Server npm deps
│  ├─ knexfile.js                  # DB adapter choice from .env
│  ├─ db.js                        # Knex singleton + auto-migrate on boot
│  ├─ mailer.js                    # Nodemailer + 4 send-* functions
│  ├─ routes/
│  │   ├─ join.js                  # POST /api/join
│  │   └─ contact.js               # POST /api/contact
│  ├─ services/
│  │   └─ submission.js            # validateJoin / validateContact + normalizers
│  ├─ migrations/                  # Knex migrations — auto-run on boot
│  │   ├─ 20261003000000_create_join_table.js
│  │   └─ 20261003000001_create_contact_table.js
│  └─ scripts/
│      └─ show-last-submissions.js
├─ .env.example                    # ← copy this to .env, fill values
├─ .gitignore
└─ data/                           # created on first run, never committed
    ├─ app.db                      # SQLite file
    └─ email-failures/             # Failed emails queued as JSON files here
```

---

## 8. Common fixes

| Symptom | Fix |
|---|---|
| "SMTP_VERIFY_FAILED" on boot | Wrong host/port/user/pass. Check 465 + `secure=true`, or 587 + `secure=false`. For Gmail, use an App Password, not your main password. |
| No database file created on boot? | Make sure the `data/` folder exists and is writable; server creates it automatically if not. |
| Submitter says they never got confirmation email | (a) check spam folder, (b) check `data/email-failures/` for queued JSON, (c) add SPF/DKIM DNS records for your sending domain to improve deliverability — standard email setup. |
| Forgot which env var controls what? | Open `.env.example` — every line has a comment. |
