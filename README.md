# PIMSY Implementations

Implementation and project management for PIMSY EHR, with a customer-facing
portal and two-channel messaging. Built to replace Dock.

**This system holds no PHI.** It tracks implementation logistics only —
timelines, configuration checklists, training scheduling and correspondence.
That constraint is deliberate and it is what keeps hosting simple: no BAA
required, no encryption-at-rest gymnastics, no HIPAA audit surface.

---

## What it does

**Internal project management** — phases, tasks, dependencies, assignees, due
dates, estimates, risks and milestones. Task boards per project, a personal
"my work" queue, and a chase list of everything sitting with customers.

**Task detail** — every task opens to its own page: description, status,
threaded comments, links, and file/image attachments. Comments and attachments
carry their own INTERNAL/SHARED marking, and can never be more visible than the
task holding them.

**Named customer owners** — a task can be assigned to a specific contact at the
practice, not just "the customer". Doing so makes it their action item and
surfaces it in their portal under their name.

**Two-channel messaging** — every project has customer-facing threads *and* an
internal back channel. The internal channel is invisible to the customer, which
is the thing Dock cannot do. An internal thread can be promoted to shared; that
action is deliberate, confirmed, and audit-logged.

**Customer portal** — each practice signs in with a magic link and sees their
timeline, their action items, shared milestones, project updates, shared
documents, and their conversation with your team. Nothing else.

**Leadership reporting** — portfolio health, at-risk projects, go-live
schedule, median cycle time, on-time rate, risk register, and per-specialist
capacity against declared weekly hours.

**Management area** (`/admin`) — one place for org-wide numbers, every project
in a filterable table, every customer with rollups, people, and alert policy.
Open to OWNER, ADMIN and MANAGER; the People and Alerts tabs are admin-only.

**Alert settings** — per-person email preferences for staff and customers,
org-wide defaults for each side, an admin override for any individual, and a
master switch that stops all outbound email. In-app notifications are always
delivered; only email is configurable.

**Outlook and Teams** — see [Notifications](#notifications) below.

**Templates** — your Dock Implementation Template, ported: 12 phases, 143
tasks, 8 milestones, with Dock's internal/external flags preserved. Creating a
project from it materializes the whole plan with dates computed from the
kickoff date.

---

## The safety boundary

One enum decides everything a customer can see:

```
visibility: INTERNAL | SHARED
```

Three rules, enforced in `src/lib/authz.ts` and `src/lib/portal.ts`:

1. A `CUSTOMER` user can only reach rows belonging to their own `customerAccountId`.
2. A `CUSTOMER` user can only see rows whose `visibility` is `SHARED`.
3. A `CUSTOMER` user can only reach projects with `portalEnabled = true`.

Reaching another customer's project returns **404, never 403** — a 403 would
confirm the project exists.

Customer-owned tasks (`ownerSide = CUSTOMER`) are forced to `SHARED`, because a
hidden action item is work nobody will ever do. Conversely, a customer action
item cannot be flipped back to internal without first reassigning it.

The same rule governs comments and attachments: neither can be more visible
than the task it hangs off, so a SHARED attachment on an INTERNAL task stays
hidden.

`npm test` locks all of this down — 45 tests against a real Postgres. They have
been mutation-checked: deliberately breaking a visibility filter makes them
fail. One of these tests caught a real leak during development, where an
attachment carrying both a task and a project id skipped the task's check.

---

## Notifications

Three channels, in order of how much setup each needs.

### In-app

Always on, never configurable. Suppressing these would hide things people have
to act on.

### Email — this is your Outlook integration

There is nothing to install. Mail goes out through Resend and lands in Outlook
like any other mail, so "notify me in Outlook" is already done once
`RESEND_API_KEY` and a verified sending domain are set.

The templates are written for Outlook specifically, which matters more than it
sounds. Desktop Outlook renders HTML with Word's engine: it ignores padding on
inline elements, so a normal CSS button collapses into a bare blue link. The
buttons here are tables with a VML rounded-rectangle behind them, the shell is
fixed-width because `max-width` is unreliable there, and every message carries a
real plain-text alternative built from the same content rather than scraped out
of the HTML — that is what shows in the reading-pane preview and on a phone.

What generates mail:

| Event | Who hears about it |
|---|---|
| Task assigned to you | The assignee — staff or a named customer contact |
| Task completed | Project lead and the task's owner. A customer clearing an action item is the loudest one. |
| New message or reply | Everyone on the thread |
| Mentioned by name | The person mentioned |
| Comment on a task | Task owner and project lead |
| File or link attached | Project lead and the task's owner |
| Due soon / overdue | The owner |
| Milestone, status update | Customer contacts on the project |
| Project flagged at risk, new risk | Staff — leadership usually wants these |

Every row is subject to that person's alert settings, the org default for their
side, and the master switch. Staff and customers get different links to the same
object, because they reach it by different routes.

### Microsoft Teams — optional, about two minutes

Off by default. Turn it on at **Management → Alerts → Microsoft Teams**.

The channel is a **customer-activity feed**: a customer sending a message,
completing an action item, or attaching a document. Staff talking to each other
is already visible in the app; a customer doing something is what needs to reach
someone who isn't looking.

To connect it, in Teams: hover the channel → **⋯** → **Workflows** → *Post to a
channel when a webhook request is received* → copy the URL and paste it in.
No Azure app registration, no admin consent, no IT ticket. A **Send a test
card** button confirms it reaches the right channel before you rely on it.

Two things worth knowing:

- This replaces the old "Incoming Webhook" connector, which Microsoft
  [retired on 22 May 2026](https://devblogs.microsoft.com/microsoft365dev/retirement-of-office-365-connectors-within-microsoft-teams/).
  An older connector URL will not deliver.
- The webhook URL is validated against an allowlist of Microsoft-operated
  hosts. These cards can carry internal detail, so a mistyped or
  pasted-from-elsewhere URL is a leak rather than an inconvenience, and is
  refused at save time and again at send time.

Customers never receive Teams notifications — they are external to your tenant.
Their side stays email.

A project can override the org-wide channel with its own
(`project.teamsWebhookUrl`), if you want a channel per large implementation.

---

## Stack

- **Next.js 15** (App Router, React 19, server actions)
- **Postgres** via **Drizzle ORM** — no engine binaries, fast serverless cold starts
- **Auth.js v5** — magic link (Resend) for everyone, optional Google SSO for staff,
  plus a bespoke email+password option with "forgot password" recovery (see
  `src/actions/auth.ts`) for anyone who'd rather not wait on an email link
- **Tailwind v4** — light and dark, no component library
- **Vitest** for the authorization tests

---

## Running it locally

**Windows:** double-click `START-HERE.bat`. It checks Node, installs, sets up
the database, loads the playbook and starts the app.

**Everything else:**

```bash
npm install
npm run setup      # writes .env.local, creates the schema, seeds the playbook
npm run build
npm run start
```

Then open <http://localhost:3000>.

Note the `build` + `start` rather than `dev`. The embedded database is
single-process, and `next dev` runs render workers — a second worker opening the
same database folder crashes it with an opaque WASM abort. **If you want
`npm run dev`, point `DATABASE_URL` at a real Postgres first.** Only one copy of
the app can use the embedded database at a time either way.

No database server is required. `npm run setup` defaults to **PGlite** —
Postgres compiled to WebAssembly, stored in a local `.pglite` folder — so there
is nothing to install and nothing to run alongside the app. Two caveats: it is
single-process (stop the dev server before re-running `setup` or `db:seed`, or
you'll get a lock error), and it is strictly for local evaluation. Point
`DATABASE_URL` at a real Postgres for anything shared or deployed, and `npm run
setup` will use that instead.

`npm run setup:reset` wipes the local database and starts over.

`npm run demo:content` fills one demo project with realistic conversation,
comments, attachments and a published status update — worth running before you
show the system to anyone, so no screen reads "nothing here yet". It needs the
sample files in `/tmp/demo`; regenerate or edit the script if you'd rather use
your own.

### Signing in

With no `RESEND_API_KEY`, no email is sent. The magic-link URL is written to
**`SIGN-IN-LINK.txt`** in the project root and printed in the terminal. Open the
file and click the link. Sign in as `alexander@pimsyehr.com` to land as owner —
that address is the configured `BOOTSTRAP_OWNER_EMAIL`.

Each request overwrites the file, links work once, and they expire after 24
hours.

To see the customer side, open any project → **Settings** → **Portal contacts**
→ invite a contact with any address, then use that sign-in link in a private
window.

The first person to sign in with `BOOTSTRAP_OWNER_EMAIL` becomes `OWNER`.
Anyone on a domain in `INTERNAL_EMAIL_DOMAINS` becomes a `SPECIALIST`. Every
other address is refused unless a staff member has invited it, so no stranger
can self-register into a customer's workspace.

Nobody has a password by default — the sign-in page's password option is
there for anyone who sets one. **`/forgot-password`** is dual-purpose: it
resets a password if one exists, or sets one for the first time if it
doesn't, and works the same way as magic links do locally — with no
`RESEND_API_KEY`, the link is written to **`PASSWORD-RESET-LINK.txt`**
instead of emailed. Once signed in, both Settings pages (staff and portal)
have a Password card to change it later.

### Seeding in production

```bash
npm run db:seed -- --templates-only
```

Loads the templates and skips the demo customers.

---

## Deploying to Vercel + Neon

1. **Database** — create a Neon project. Copy the *pooled* connection string to
   `DATABASE_URL` and the *direct* one to `DIRECT_URL`.
2. **Push the repo** to GitHub and import it in Vercel.
3. **Environment variables** — set everything from `.env.example` in Vercel:
   `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`,
   `RESEND_API_KEY`, `EMAIL_FROM`, `INTERNAL_EMAIL_DOMAINS`,
   `BOOTSTRAP_OWNER_EMAIL`. Add `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` for
   staff SSO.
4. **Email** — add and verify your sending domain in Resend, then point
   `EMAIL_FROM` at it (e.g. `implementations@pimsyehr.com`). Deliverability to
   customer inboxes depends on this; don't skip the DNS records.
5. **Migrate** — run `npm run db:push` locally against the production
   `DIRECT_URL` once, or wire `npm run db:migrate` into your deploy step.
6. **Seed templates** — `npm run db:seed -- --templates-only`.
7. **Google SSO (optional)** — in Google Cloud Console create an OAuth client
   with redirect URI `https://your-domain/api/auth/callback/google`.

Running cost at your scale is roughly: Vercel Pro ~$20/user/month (Hobby is
free but not licensed for commercial use), Neon ~$19/month, Resend ~$20/month.

### Self-hosting instead

Nothing here is Vercel-specific. `next build && next start` behind a reverse
proxy works, with any Postgres. Swap Resend for SMTP by replacing the provider
in `src/auth.ts` and the transport in `src/lib/email.ts`.

---

## Deploying to Azure

There's a full runbook in **`azure/README.md`**, plus a `Dockerfile`, a Bicep
template (`azure/main.bicep`) that provisions Postgres, Blob Storage, a
container registry, and an App Service in one command, and a GitHub Actions
workflow that builds, migrates, and redeploys on every push. Short version:

1. Fill in `azure/main.parameters.json` (a Postgres password and an
   `AUTH_SECRET`, at minimum).
2. Run `./azure/deploy.sh <resource-group> <region>`.
3. Add the six secrets it lists to your GitHub repo.
4. Push to `main`.

`src/lib/storage.ts` automatically switches from local disk to Azure Blob
Storage when `AZURE_STORAGE_CONNECTION_STRING` is set — the Bicep template
sets it for you — so file uploads survive restarts and scale-out the way
they wouldn't on plain local disk.

---

## Project layout

```
src/
  auth.ts                    Auth.js config, role assignment, sign-in gatekeeper
  db/
    schema.ts                All tables, enums and relations
    seed.ts                  Templates + demo data
    template-implementation.ts   The Dock playbook, ported
  lib/
    authz.ts                 THE PERMISSION LAYER — read this first
    portal.ts                Customer-safe queries (account + SHARED filtered)
    threads.ts               Thread access, inbox, participants
    queries.ts               Staff/reporting queries
    guard.ts                 requireStaff / requireCustomer / requireAdmin
    audit.ts, notify.ts, rollup.ts, email.ts, dates.ts
  actions/                   Server actions (mutations); every one re-checks authz
  app/
    (app)/                   Internal staff app
    portal/                  Customer portal
    signin/                  Magic link + SSO
tests/
  authz.test.ts              The security boundary and notifications, 45 tests
```

**If you change one thing, change it in `src/lib/authz.ts`** and let everything
else call through it. Never hand-roll a portal query.

---

## Known gaps / next steps

Honest list of what isn't built yet:

- **Template editing is code, not UI.** Edit
  `src/db/template-implementation.ts` and re-run the seed. A visual template
  editor is the obvious next feature.
- **File uploads write to local disk by default.** Files go to `./uploads`
  (set `UPLOAD_DIR` to move it) and are served only through
  `/api/files/[id]`, which re-checks permissions first. That's fine locally
  and self-hosted; on a platform with an ephemeral filesystem (Vercel, or
  Azure App Service without this switched on), set
  `AZURE_STORAGE_CONNECTION_STRING` and `src/lib/storage.ts` uses Azure Blob
  Storage instead — see "Deploying to Azure" above. Vercel would need its own
  blob-store swap; nothing here is wired up for that yet. Limits: 25 MB, no
  executables.
- **Phase durations are inferred.** Dock carries no day offsets, so the ~90-day
  timeline in the template is an estimate. Tune `offsetDays` / `durationDays`
  against a few real projects.
- **Nesting in the Forms group** of the ported template was ambiguous in Dock's
  export; worth a read-through.
- **No real-time.** Messages appear on navigation/refresh, not by push. Fine at
  this scale; add polling or SSE if it grates.
- **Notification digests.** Emails fire per-event; there's no daily roll-up yet.
- **No Dock data migration.** Templates came across; live project state did not.
- **Teams is a channel feed, not a DM.** Posting to a person's Teams activity
  feed needs an Azure AD app registration and admin consent, which is a real IT
  ask; the webhook needs neither. If per-specialist DMs turn out to matter, that
  is the upgrade path.
- **No calendar invites yet.** Training sessions and go-live dates are dates in
  the app, not `.ics` attachments that drop into someone's Outlook calendar.
  This is probably the highest-value thing left on the notification side.
- **Email fires per event.** No daily digest, so a busy project can be chatty.
  Per-person alert settings are the current mitigation.

### Two bugs found by testing this, worth knowing about

Both were pre-existing and both are fixed, but they explain why some things may
not have worked if you tried them before now:

- **Every mutation silently failed on the embedded database.** `src/db/index.ts`
  cached its client on `globalThis` only outside production — the usual idiom. A
  production build splits the server into separate bundles, so each one built its
  own client, and with PGlite that meant two embedded databases over one folder.
  Reads worked, so the app looked fine, but nothing a server action wrote was
  ever visible. Ticking a task off did nothing. A test now fails if that guard
  comes back.
- **`npm run setup` only ever applied `drizzle/0000_init.sql`.** Any later
  `drizzle-kit generate` was ignored, so a schema change produced a database
  missing its new columns. It now applies every migration in order.
