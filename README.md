# EasyMail

A self-hosted personal email platform built on [Resend](https://resend.com). Send and receive mail for all your projects, keep a permanent archive, and see delivery/open/click analytics, all inside free tiers (Resend, Vercel Hobby and Supabase).

- **Inbox / Sent / Conversations**: threaded via `Message-ID` / `In-Reply-To`, so replies thread correctly in Gmail too
- **Compose / Reply / Forward**: rich text, attachments, and a send-from address per project
- **Analytics**: volume, delivery, bounce, open and click rates, top contacts, top links and busiest hours, per project
- **Tracks your other apps**: mail sent through the same Resend account by any project is picked up from webhooks
- **Free-tier guard**: counts sent **and** received mail against Resend's 100/day and 3,000/month, and blocks sends before you hit the cap
- **Permanent archive**: Resend keeps mail for 30 days, so EasyMail stores everything in Postgres and copies attachments to Supabase Storage
- **Private**: its own admin accounts (an `admins` table with scrypt-hashed passwords, not Supabase Auth), signed session cookies, and incoming HTML rendered in a sandboxed iframe with remote images blocked
- **Light, dark or system theme**: switch it from the sidebar; the choice is remembered

## How it stays within the free tier

| Action | Resend API calls |
|---|---|
| Send an email | 1 |
| Receive an email | 1 (`receiving.get`, because webhooks carry no body) + 1 per archived attachment |
| Delivery, opens, clicks, bounces | 0 (pushed by webhooks) |
| Dashboards, analytics, search | 0 (served from your database) |
| Daily cron (usage sync) | 1 per day |

There is no polling anywhere. API calls are throttled to 8 per second, under Resend's 10 per second limit.

## Architecture

```
Resend ──webhooks (signed)──► /api/webhooks/resend ──► Supabase Postgres + Storage
   ▲                              │ email.received → receiving.get → store body
   │ send / reply                 │ email.sent/delivered/opened/clicked/bounced → events
Next.js UI (Vercel) ── server actions ── quota guard ── Resend SDK
```

### Services

All Supabase access (Postgres and Storage) lives in `src/services/`. Pages, server actions and API routes only check the session, call a service and render.

| File | Responsibility |
|---|---|
| `supabase.ts` | The connections: Postgres pool, Supabase JS client, and `readDb()` (timeout plus one reconnect-and-retry for reads) |
| `mail.service.ts` | Inbox/sent lists, threads, flags, deletes, exports, delivery-status refresh |
| `send.service.ts` | Sending mail: quota check, Resend, storing the message, contacts, attachments |
| `inbound.service.ts` | Webhook processing: received mail and delivery/open/click/bounce events |
| `analytics.service.ts` | Statistics for the Analytics page (cached) |
| `activity.service.ts` | The activity log: every send, receive, delivery event, sign-in and admin change |
| `quota.service.ts`, `project.service.ts`, `admin.service.ts`, `settings.service.ts`, `storage.service.ts` | Usage counters, projects and addresses, admins, key/value settings and contacts, attachment storage |

Every notable event is written once to the `activity_log` table (kept for 90 days). The dashboard reads that table plus cached statistics, so reloading it or switching filters does not re-run the queries. The cache is refreshed the moment something new is logged.

Stack: Next.js 16 (App Router), Tailwind CSS 4, Drizzle ORM, Supabase, Resend SDK, Recharts, Tiptap.

## Setup

You need three free accounts: [Supabase](https://supabase.com) (database and file storage), [Resend](https://resend.com) (sending and receiving mail) and [Vercel](https://vercel.com) (hosting). You also need Node.js 20.9 or newer and a domain you control.

### 1. Get the code
```bash
git clone <your-fork-or-copy-of-this-repo> easymail
cd easymail
npm install
cp .env.example .env.local   # Windows PowerShell: Copy-Item .env.example .env.local
```
Every value you collect in the next steps goes into `.env.local`. This file is git-ignored; never commit it.

### 2. Supabase
1. Create a free project. Pick a region close to your Vercel region and save the database password you choose.
2. **Storage** → create a **private** bucket named `attachments`.
3. Collect these values:

   | Variable | Where to find it |
   |---|---|
   | `SUPABASE_URL` | Project Settings → API: the project URL, `https://<ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API keys: the secret / service-role key |
   | `SUPABASE_DB_PASSWORD` | The database password from step 1, written as-is (no URL-encoding). Reset it under Database → Settings if you lost it. |
   | `SUPABASE_REGION` | Click **Connect** on the project. The pooler host reads `aws-0-<region>.pooler.supabase.com`, e.g. `ap-south-1`. If your host starts with `aws-1-`, use the full `aws-1-<region>`. |
   | `SUPABASE_ANON_KEY` (optional) | The public key. Storage uses the service-role key when it is set and falls back to this one otherwise. With only the anon key, the `attachments` bucket needs Storage policies that allow upload, read and delete. The database is unaffected. |

   The app reaches the database through the IPv4 transaction pooler (port 6543), which Vercel can use. Migrations use the session pooler (port 5432). To use any other Postgres, set `DATABASE_URL` and it overrides all of this.

Row Level Security is switched on for every table and no policies exist. The app only talks to the database from the server, so nothing is exposed to the browser.

### 3. Resend
1. Resend → **API Keys** → create a key with **Full access** (needed to register webhooks and read usage). Put it in `RESEND_API_KEY`.
2. Resend → **Domains** → add your sending domain. If the root domain already receives mail (Gmail, Zoho, …), use a **subdomain** such as `mail.yourdomain.com` so your existing mail is untouched.
3. Add the DKIM/SPF records Resend shows at your DNS provider and wait for the domain to verify.
4. Enable **Receiving** for the domain and add the **MX** record it shows, on that subdomain only.
5. For open and click analytics, turn on tracking. Both are **off by default** and the Opened / Clicked stats stay at 0% without them. When adding the domain, expand **Tracking options** and tick **Enable open tracking** and **Enable click tracking**. Resend also asks for a tracking subdomain (the default `links` is fine) and one more DNS record, usually a CNAME, which must verify. Only mail sent after it verifies is tracked.
   - An **open** is counted when the recipient's mail client loads a hidden image. Opening the mail inside EasyMail does not count, because EasyMail blocks remote images. Apple Mail can report opens that didn't happen and clients that block images hide real ones, so treat the open rate as a rough guide.
   - A **click** is counted when the recipient clicks a link in the body, so emails without links can never register one.

### 4. Secrets and timezone
Generate two random strings and put them in `SESSION_SECRET` and `CRON_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run it twice, once per value. Optionally set `APP_TIMEZONE` to your [IANA timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), e.g. `America/New_York`. It defaults to `UTC` and only affects how dates and the busiest-hours chart are shown.

### 5. Create the tables
```bash
npm run db:migrate
```
This applies every file in `drizzle/` to your Supabase database. Run it again after pulling updates that add new migration files; it is safe to repeat. If it cannot connect, re-check `SUPABASE_URL`, `SUPABASE_DB_PASSWORD` and `SUPABASE_REGION`.

### 6. Run it locally and create your admin
```bash
npm run dev
```
Open http://localhost:3000. On first run you are sent to **/setup** to create your admin username and password. That page only works while no admin exists, so do this **before** deploying and the public URL is never left unclaimed. Add more admins or change passwords later in **Settings → Admins**.

Then in **Projects**, create a project and add the addresses you want to send from or receive on, e.g. `hello@mail.yourdomain.com`.

### 7. Deploy to Vercel
1. Push your copy of the repo to GitHub and import it in Vercel.
2. Add every variable from `.env.local` under **Settings → Environment Variables**.
3. Deploy. `vercel.json` registers a daily cron that calls `/api/cron/daily`. Vercel sends `CRON_SECRET` as a bearer token, so the variable must be set or the cron is rejected.
4. Optional: in Vercel → Settings → Functions, set the function region to the one nearest your Supabase region for faster pages.

### 8. Connect the webhook
Open your deployed app → **Settings → Resend webhook**, check the URL (e.g. `https://your-app.vercel.app`) and click **Connect webhook**. EasyMail calls the Resend API to register `/api/webhooks/resend` with every `email.*` event and stores the signing secret in the database. You don't need `RESEND_WEBHOOK_SECRET`.

The same card can show **recent deliveries**, **replay** a failed one, **rotate** the secret (the old secret keeps working for 24 hours) and **disconnect**. Each click costs one API call, and nothing polls.

Prefer to do it by hand? Resend → Webhooks → endpoint `https://<your-app>/api/webhooks/resend`, with the events received, sent, delivered, delivery_delayed, bounced, complained, opened, clicked, failed and suppressed. Put its signing secret in `RESEND_WEBHOOK_SECRET`.

For local testing, expose `npm run dev` with a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and connect using the tunnel URL.

### Environment variables

Required:

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key (Full access), starts with `re_` |
| `SUPABASE_URL`, `SUPABASE_DB_PASSWORD`, `SUPABASE_REGION` | Database connection (or set `DATABASE_URL` instead) |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage access for attachments (or `SUPABASE_ANON_KEY`, see above) |
| `SESSION_SECRET` | Signs login cookies. At least 32 characters. |
| `CRON_SECRET` | Authorises the daily cron |

Optional, only add these to change the default:

| Variable | Default | Purpose |
|---|---|---|
| `APP_TIMEZONE` | `UTC` | Timezone used to display dates |
| `DAILY_SEND_CAP` | `95` | Blocks sending at this many emails per day (sent + received). Resend's free hard limit is 100. |
| `DAILY_WARN_AT` | `80` | Shows a warning from this daily count |
| `MONTHLY_CAP` | `3000` | Monthly limit (free tier) |
| `ARCHIVE_ATTACHMENTS` | `true` | Copy attachments into Supabase Storage |
| `MAX_ATTACHMENT_MB` | `4` | Max total attachment size on an outgoing email (Vercel limit is 4.5 MB) |
| `ARCHIVE_MAX_MB` | `10` | Largest inbound attachment to archive |
| `SUPABASE_BUCKET` | `attachments` | Storage bucket name |
| `RESEND_WEBHOOK_SECRET` | none | Only for a webhook created by hand. **Connect** in Settings stores the secret for you. |
| `DATABASE_URL` | none | Use any Postgres instead of building the URL from `SUPABASE_*` |
| `DATABASE_POOL_MAX` | `8` | DB connections per server instance |

### Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid environment configuration` on start | A required variable is missing or malformed; the message names it. |
| `relation "admins" does not exist` or similar | Run `npm run db:migrate`. |
| Migration cannot connect | Check `SUPABASE_REGION` (the part of the pooler host after `aws-0-`) and that the password has no URL-encoding. |
| Signed out everywhere after changing `SESSION_SECRET` | Expected: existing sessions are invalidated, sign in again. |
| Mail sent but nothing arrives in Inbox | Check the MX record for your subdomain and that the webhook is connected in Settings. |
| Cron returns 401 | `CRON_SECRET` is missing in Vercel's environment variables. |
| Free Supabase project paused | The daily cron queries the database to prevent this. Resume the project in Supabase if it happened anyway. |

## Tagging mail from your other apps
Anything your projects send through the same Resend account appears under **Sent**. To file it under a project, either send from an address registered in EasyMail, or add a tag:

```ts
await resend.emails.send({ ..., tags: [{ name: "project", value: "<project-slug>" }] });
```

## Contact form API for your websites
Websites can send you mail through EasyMail without holding a Resend key. In **Projects → Website API keys**, generate a key for a project, choosing the From address, the recipient and the website domains allowed to use it. The key is shown once and only its hash is stored. Make sure you have run `npm run db:migrate` so the `api_keys` table exists.

```http
POST https://<your-app>/api/contact
x-api-key: em_...
Content-Type: application/json

{ "name": "Ada", "email": "ada@example.com", "message": "Hello", "phone": "optional", "organization": "optional" }
```

From a website, call it like this:

```js
await fetch("https://<your-app>/api/contact", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": "em_..." },
  body: JSON.stringify({ name, email, message }),
});
```

Keep the allowed domains tight, because the key is visible in your page. The request's `Origin` must match one of the key's domains (otherwise `403`). The mail is sent from the key's address to its recipient with `Reply-To` set to the visitor, and it is counted against the free-tier guard. Revoke a key at any time from the same page. A `website` field is a honeypot for bots, and each key and visitor IP is limited to 5 messages per 10 minutes.

## Scripts
| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (quota math, threading helpers, status transitions) |
| `npm run typecheck` | TypeScript check |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |

## License
MIT
