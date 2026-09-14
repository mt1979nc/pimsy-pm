# Nathan demo — PATH (local fixtures only)

**Live:** https://pimsy-app.azurewebsites.net  
**Repo:** https://github.com/mt1979nc/pimsy-pm  
**Product:** PATH — Plan · Assign · Track · Handoff. **Prism** (capacity / forecast / analysis) is a module inside PATH.

This app holds **no PHI** (logistics only). Footer on sign-in says so.

**Live PATH must not contain these demo accounts.** Alexander’s production book
is real imported WIP. Strip leftovers with:

```bash
npm run db:cleanup:demo              # dry-run
npm run db:cleanup:demo -- --apply
```

See `azure/README.md` (Cloud Shell + App Setting `DATABASE_URL`).

---

## Demo logins (local / pitch only)

Shared temporary password (local seed only — never re-seed on production):

```
Demo-Nathan-2026!
```

| Role | Email | Notes |
|---|---|---|
| **Owner / Director** | `alexander@pimsyehr.com` | OWNER + canLead + isDirector. **Must change password** on first login → `/change-password`. Keep on live. |
| **Specialist** | `morgan@pimsyehr.com` | SPECIALIST, capacityExempt, canLead=false. **Must change password** on first login. Keep on live. |
| **Management (demo)** | `demo.manager@pimsyehr.com` | Local fixture only. Cleanup deletes this. |
| **Specialist (demo)** | `demo.specialist@pimsyehr.com` | Local fixture only. Cleanup deletes this. |
| **Customer (demo)** | `contact@riverbend-counseling.example.com` | Local Riverbend / IMP-9001. Cleanup deletes this. |

Use **email + password** on the sign-in page (magic link needs Resend configured).

Seed staff + Dock WIP (Azure / any env with `DATABASE_URL`):

```bash
npm run db:seed -- --templates-only   # default; playbooks only
npm run db:seed:staff-logins          # Alexander + Morgan (+ roster)
npm run db:import:dock-wip            # live Dock WIP sites, no contact emails
```

Local Nathan fixtures (do **not** run on production):

```bash
npm run db:seed -- --with-demo
npm run db:seed:demo-logins
npm run demo:content
```

See `/workspace/pimsy-pm-ops/v1.8.3-WIP-IMPORT.md` for Azure `DATABASE_URL` steps.

---

## Before you present (5 minutes)

1. Confirm sign-in shows **v1.11.1** (or current).
2. On a **local** database, sign in as Management, Specialist, and Customer (private window) using the table above.
3. Open project **IMP-9001** only on a `--with-demo` database. Live PATH should not have IMP-9001.
4. Optional: Management → Alerts → show Teams webhook is available.

---
## 8-minute click path

### 1. Problem (30 sec)
- Dock is our customer Implementation hub today.
- Portfolio reports and bots scrape the UI because **API is Enterprise / early-access**.
- We need portals + tasks + threads **and** first-class data access under our control.

### 2. Management view (1.5 min)
Sign in as `alexander@pimsyehr.com` (live) or `demo.manager@pimsyehr.com` (local only):
- `/dashboard` — portfolio health
- `/projects` — all WIP
- `/reports` — delivery Portfolio (not Waiting-on)
- `/reports/waiting-on` — SHARED-thread WIP rollup
- `/management` — Prism hub (headroom chart + member cards)

### 3. Specialist view (1.5 min)
Sign out → `morgan@pimsyehr.com` (live) or `demo.specialist@pimsyehr.com` (local):
- Only assigned projects
- Open a project → tasks, SHARED thread vs INTERNAL back-channel (Dock can’t hide internal the same way)

### 4. Customer portal (2 min)
Private window → invited contact (live) or `contact@riverbend-counseling.example.com` (local):
- `/portal` — SHARED timeline, action items, messages only
- Emphasize: wrong project → **404**, not 403

### 5. Close (30 sec)
- Azure + our Postgres ≪ Dock Enterprise for API
- Ask: PATH is the book of business; Prism in the sidebar is Capacity / Forecast / Analysis

---

## Talking points vs Dock

| Dock today | PATH |
|---|---|
| Polished customer rooms | Customer portal + staff app |
| Template clone | Same Dock playbook, dates from kickoff |
| Threads | Shared **and** internal (promote with audit) |
| API gated / expensive | **Ours** — DB + server actions; REST easy to expose |
| PHI | Logistics only (same rule) |

---

## If something breaks live

- Wrong version on sign-in → wrong deploy
- Magic link not arriving → use password; Resend optional
- Demo users still on live → `npm run db:cleanup:demo -- --apply` after a dry-run (azure/README.md)
- Attachments missing on Azure → `AZURE_STORAGE_CONNECTION_STRING` (see `azure/README.md`)
