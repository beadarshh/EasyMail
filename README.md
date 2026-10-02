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

Stack: Next.js 16 (App Router), Tailwind CSS 4, Drizzle ORM, Supabase, Resend SDK, Recharts, Tiptap.

## Setup

### 1. Supabase
1. Create a free project at [supabase.com](https://supabase.com).
2. **Storage** → create a **private** bucket named `attachments`.
3. Note four values. EasyMail builds the database connection strings from them:
   - `SUPABASE_URL`: the project URL, `https://<ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: the secret/service-role key from Project Settings → API keys
   - `SUPABASE_DB_PASSWORD`: the database password, written as-is (no URL-encoding)
   - `SUPABASE_REGION`: from **Connect**, where the pooler host is `aws-0-<region>.pooler.supabase.com`, e.g. `ap-northeast-1`. If your host starts with `aws-1-`, use the full `aws-1-<region>` instead.

   The app connects through the IPv4 transaction pooler (port 6543), which Vercel can reach. Migrations use the session pooler (port 5432). To use any other Postgres, set `DATABASE_URL` and it overrides all of this.

Row Level Security stays on with no policies. The app talks to the database server-side only.

### 2. Environment
```bash
cp .env.example .env.local   # then fill it in
npm install
npm run db:migrate           # creates the tables
npm run dev
```
Open http://localhost:3000. On first run you are sent to **/setup** to create your admin username and password. The setup page only works while no admin exists. Do this locally before deploying, so the public URL is never left unclaimed. You can add more admins and change passwords later in **Settings → Admins**.

### 3. Resend domain (sending + receiving)
If your root domain already receives mail (Gmail, Zoho, …), use a **subdomain** such as `mail.yourdomain.com` so your existing mail is untouched.

1. Resend → **Domains** → add `mail.yourdomain.com`. Add the DKIM/SPF records it shows, then enable **Receiving** and add its **MX** record on that subdomain only.
2. Turn on **open** and **click tracking** for the domain.
3. In EasyMail → **Projects**, create a project and add addresses like `hello@mail.yourdomain.com`.

### 4. Webhook
After deploying, open **Settings → Resend webhook**, check the URL (e.g. `https://easymail.vercel.app`) and click **Connect webhook**. EasyMail calls the Resend API to register `/api/webhooks/resend` with every `email.*` event, and stores the signing secret in the database. You don't need `RESEND_WEBHOOK_SECRET`.

The same card can show **recent deliveries**, **replay** a failed one, **rotate** the secret (the old secret keeps working for 24 hours) and **disconnect**. Each click costs one API call, and nothing polls.

If you'd rather set it up manually: Resend → Webhooks → endpoint `https://<your-app>/api/webhooks/resend`, with the events received, sent, delivered, delivery_delayed, bounced, complained, opened, clicked, failed and suppressed. Then put its secret in `RESEND_WEBHOOK_SECRET`.

For local testing, expose `npm run dev` with a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and connect using the tunnel URL.

### 5. Deploy to Vercel
Import the repo, add every variable from `.env.local`, and deploy. `vercel.json` registers the daily cron, which is secured by `CRON_SECRET`.

## Tagging mail from your other apps
Anything your projects send through the same Resend account appears under **Sent**. To file it under a project, either send from an address registered in EasyMail, or add a tag:

```ts
await resend.emails.send({ ..., tags: [{ name: "project", value: "<project-slug>" }] });
```

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
