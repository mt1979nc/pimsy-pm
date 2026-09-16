# Dock-replacement roadmap

Priority epics for Nathan / **PATH** (Plan · Assign · Track · Handoff). Repo remains `pimsy-pm`. Status reflects what this branch (and main) deliver.

**Product decision (Alexander):** Standalone Prism (nice-rock) must **not** remain a separate app. Fold capacity, forecast, roster, and analysis into PATH as the **Prism** module (OWNER / ADMIN / MANAGER only). Specialists keep Dock-like project execution; customers keep the portal. Do not rename the analytics module away from Prism.

**Locked priority (Alexander):** **v1.8 Prism Management** (manual roster + engagement edit) shipped — ahead of contacts / HubSpot.

## Must-have

| Epic | Status | Notes |
|------|--------|-------|
| **About / site profile** | **Shipped** (v1.7) + **v1.14.2 HOLD** | Kickoff dates/booking/CRM acronym + impl-team/practice contact cards. HubSpot deal link (optional pull). |
| **Waiting-on threads** | **Shipped** (v1.7) | `waitingOn`: PIMSY / CUSTOMER / UNKNOWN + aging. Staff badge/set; portfolio rollup of open SHARED threads; portal read-only badge. |
| **About / site profile** | **Shipped** (v1.7) | HubSpot deal, Prism client id, CRM acronym/key, Zoom booking, notes, custom fields. Staff edit + portal read-only. |
| **Waiting-on threads** | **Shipped** (v1.7, **v1.14.2** organize) | `waitingOn`: PIMSY / CUSTOMER / UNKNOWN + aging. Open vs resolved lists; reliable unread; staff + portal mark resolved. One topic per conversation for SLA. Portfolio rollup of open SHARED threads. |
| **Prism Management (v1.8)** | **Shipped** (v1.8.0–1.8.4) | Team roster flags + billable hrs + engagement roster/edit in PATH. OWNER/ADMIN/MANAGER only. Native Postgres (no Prism Azure SQL dual-write). |
| **Playbook / staffing (v1.9)** | **Shipped** (v1.9.0–1.9.1) | Editable templates, four site paths, optional areas, per-project N/A, staffing roles + auto-assign + manager overview, staff-only Update History. |
| **Forecast (v1.10)** | **Shipped** | Weekly hours + peak week + headroom + hire-now; weights listed; Analysis exclusions (SENSORI/MHC/LECHRIS default). Native Postgres. |
| **Prism cutover (v1.11)** | **Shipped** (v1.11.0–1.11.3) | PATH is SoT. Import + snapshot API + add-to-roster + Analysis table. v1.11.1 restores Portfolio vs Waiting-on; v1.11.2 fixes blank Headroom + team load cards and typed delete; v1.11.3 replaces Headroom bars with a load-vs-capacity line chart. |
| **Dock parity (v1.12)** | **Shipped** (v1.12.0–1.12.4) | Active-book prune, nested playbook resync, **task attachments**, training checklists, Learning Center, Forecast+ go-live scenarios. RAC and TANC both stay on the allowlist until Alexander consolidates. Runbook: `v1.12-DOCK-PARITY.md`. |
| **Template area (v1.13)** | **Shipped** (v1.13.0–1.13.10) | Dock task buttons, file library Link/Form, expose/hide tabs, analytics-exclude, **Customer view shared task comments** + **missing-library-file download UX**. Runbook: `v1.13-TEMPLATES.md`. |
| **Any-specialist access (v1.14)** | **This branch** (v1.14.0) | Specialists can open/edit any active implementation site, not only the named primary assignee. MEMBER stays membership-scoped. Customer portal unchanged. **Hold from live** until Alexander ships the v1.14 batch. |
| **Auto customer invite (v1.14)** | **This branch** (v1.14.1) | PATH emails a portal invite when a site is set up or a contact is added; idempotent; staff Resend; INTERNAL_EMAIL_DOMAINS stay staff. Hold from live until Alexander ships. Runbook: `v1.14-AUTO-INVITE.md`. |
| **specialist slip save and weekly-meeting roster (v1.14.2)** | **This branch** | Specialists can record a go-live slip that actually saves, with a dedicated Record slip control and confirmation. |
| **PATH staff Move… across section and parent (v1.14.3)** | **This branch** | PATH staff can Move… a live task or sub-task to another section (Configuration, Discovery, …) or under a different parent — Dock’s drag-and-drop stays parent-bound; this is the cross-parent / cross-section path. |
| **wizard /go deep-links into portal vs staff PATH routes (v1.14.3)** | **This branch** | Discovery Wizard and related flows deep-link into real PATH portal or staff destinations instead of a generic wizard URL with no site. |
| **About / kickoff / CRM contact parity (v1.14.3)** | **This branch** | About matches kickoff logistics and live CRM contacts: implementation-team cards from playbook assignees, practice cards that update when contacts change, and a HubSpot deal link (optional pull). |
| **business-day dues and Forecast+ section dates (v1.14.3)** | **This branch** | New projects schedule kickoff, Forecast+ section dates, and projected go-live; task due recommendations land on business days only (Saturday bumps Friday or Monday). |
| **waiting-on-customer grouped by area (v1.14.3)** | **This branch** | Staff waiting-on-customer lists stay in place and now break down outstanding customer actions by Discovery, Configuration, and Training. |
| **Zendesk deep-link and Accessing Pimsy auto-fill (v1.14.3)** | **This branch** | Zendesk org/email setup checks open the PIMSY Help Desk agent search (no API token), and Accessing Pimsy fills bookmark, desktop app, acronym, and security key on workspace create when those fields already exist. |
| **PIMSY EHR login confirmation on the training task (v1.14.3)** | **This branch** | Staff “Confirm users have logged in” task details show PATH portal contacts plus live PIMSY EHR who/duration when an audit feed is configured — never invented PHI or sample sessions. |
| **kickoff extras, contact cards, and Project updates purpose (v1.14.3)** | **This branch** | About/kickoff shows kickoff date, go-live, specialist, Zoom booking, and notes already stored on the project (no HubSpot on the customer tab); contact cards share one layout; Project updates say when to use them. |
| **thread open/resolved, unread, and mark resolved (v1.14.3)** | **This branch** | Threads organize open vs resolved, unread follows the last-read cursor reliably, and staff or portal can mark a topic resolved. |
| **thread open/resolved, unread, and mark resolved (v1.14.3)** | **This branch** | Threads organize open vs resolved, unread follows the last-read cursor reliably, and staff or portal can mark a topic resolved. |
| **thread open/resolved, unread, and mark resolved (v1.14.3)** | **This branch** | Threads organize open vs resolved, unread follows the last-read cursor reliably, and staff or portal can mark a topic resolved. |
| Contacts + Zoom booking | Planned (after v1.8) | Contact roles, booking links wired into About + invite flows. |
| HubSpot on create | Planned (after v1.8) | Capture deal URL / deal id when creating a project from a win. |
| **Portfolio WIP view** | **Shipped** (v1.7 rollup + v1.11.1 restore) | Leadership → Portfolio (`/reports`) is delivery health; Waiting on (`/reports/waiting-on`) is the SHARED-thread rollup. |

## Milestone: Retire standalone Prism

**Destination:** retire standalone Prism (purple-beach / nice-rock) after parity in PATH. Prism stays as the analytics module. Management-only; specialists and customers are unchanged.

| Step | Version / gate | Status | Scope |
|------|----------------|--------|-------|
| 1. Management hub | **v1.8** | **Shipped** | Capacity settings + team roster / flags + engagement edit. Native Postgres (not dual-write Prism SQL). OWNER/ADMIN/MANAGER only. |
| 2. Playbook + staffing | **v1.9.0–1.9.1** | **Shipped** | Editable templates, four paths, optional areas, N/A, staffing roles, staff Update History. |
| 3. Forecast | **v1.10** | **Shipped** | Weekly hours, peak week, headroom, hire-now, weights, Analysis exclusions. Native Postgres. |
| 4. Cutover | **v1.11** | **Shipping** (this branch) | Import live Prism state; Director/Pipeline/morning snapshot from PATH (`/api/prism/snapshot`); add-to-roster + Analysis table. Dual-read is dump CLI only. |
| 5. Write cutover | **v1.11** | **Done in PATH** | Writes already land only in PATH. Standalone Prism stays human-writable until Alexander darks it. |
| 6. **Retire standalone Prism** | After go/no-go | **Ready to dark** | Archive / shut down nice-rock after the checklist in `v1.11-PRISM-CUTOVER.md`. |

Sequence: **v1.7 About + waiting-on (shipped)** → **v1.8 Prism Management (shipped)** → **v1.9 playbook/staffing (shipped)** → **v1.10 Forecast (shipped)** → **v1.11 Prism cutover (shipped)** → **Milestone: dark standalone Prism** (Alexander confirms). **v1.14.x About/kickoff/CRM (this PR, HOLD)** waits for Alexander to ship the major batch.

## Demo polish

| Epic | Status |
|------|--------|
| Status updates feed | **Shipped** (v1.14) — in-app purpose copy; composer still the weekly snapshot |
| Zoom recordings sync | Planned |
| Template reseed | Planned — `--templates-only` still the ops path; v1.13 duplicate is an in-app copy, not a live Dock pull |
| Mentions / notify | Partial (exists; polish remaining) |
| File library by area | **Shipped** (v1.12) | Reusable library + Learning Center topic groups; placeholders until Dock binaries are uploaded. |

## Ops

| Epic | Status |
|------|--------|
| Thin read API | Planned |
| Activity log | Partial (audit log exists; UI polish remaining) |
| Multi-assignee / coverage | Planned |
| Prism sync | **Cutover (v1.11)** — one-time import; runtime reads PATH only (`/api/prism/snapshot`) |
| Permissions | Partial (role + membership; **v1.14.0** specialists share the implementation book) |
| Mobile portal | Planned |

## Later

| Epic | Status |
|------|--------|
| RCM (full forecast/analysis) | Later — v1.9 ships RCM *playbook paths* only |
| Health score | Later |
| In-app daily review | Later |
| SSO | Later |
