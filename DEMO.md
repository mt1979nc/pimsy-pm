# Nathan demo — PIMSY Implementations (Dock replacement)

**Live:** https://pimsy-app.azurewebsites.net  
**Repo:** https://github.com/mt1979nc/pimsy-pm  
**Version:** v1.8.3  
**Pitch in one line:** Same Implementation playbook as Dock, with an internal back-channel Dock can’t do, plus an API we own — without Dock Enterprise (~$1k/mo) pricing.

This app holds **no PHI** (logistics only). Footer on sign-in says so.

---

## Demo logins (password)

Shared temporary password:

```
Demo-Nathan-2026!
```

| Role | Email | Notes |
|---|---|---|
| **Owner / Director** | `alexander@pimsyehr.com` | OWNER + canLead + isDirector. **Must change password** on first login → `/change-password`. |
| **Specialist** | `morgan@pimsyehr.com` | SPECIALIST, capacityExempt, canLead=false. **Must change password** on first login. |
| **Management (demo)** | `demo.manager@pimsyehr.com` | Full portfolio (legacy Nathan demo). |
| **Specialist (demo)** | `demo.specialist@pimsyehr.com` | Assigned projects only. |
| **Customer (demo)** | `contact@riverbend-counseling.example.com` | `/portal` — Riverbend / IMP-9001 |

Use **email + password** on the sign-in page (magic link needs Resend configured).

Seed staff + Dock WIP (Azure / any env with `DATABASE_URL`):

```bash
npm run db:seed -- --templates-only   # if templates missing
npm run db:seed:staff-logins          # Alexander + Morgan (+ roster)
npm run db:import:dock-wip            # 15 live Dock WIP sites, no contact emails
# optional Nathan demos:
npm run db:seed:demo-logins
npm run demo:content
```

See `/workspace/pimsy-pm-ops/v1.8.3-WIP-IMPORT.md` for Azure `DATABASE_URL` steps.

---

## Before you present (5 minutes)

1. Confirm sign-in shows **v1.8.3**.
2. Sign in as Management, Specialist, and Customer (private window) using the table above.
3. Open project **IMP-9001**. If screens look empty, re-run seed + `demo:content` + `db:seed:demo-logins` against that database.
4. Optional: Management → Alerts → show Teams webhook is available.

---
## 8-minute click path

### 1. Problem (30 sec)
- Dock is our customer Implementation hub today.
- Portfolio reports and bots scrape the UI because **API is Enterprise / early-access**.
- We need portals + tasks + threads **and** first-class data access under our control.

### 2. Management view (1.5 min)
Sign in as `demo.manager@pimsyehr.com`:
- `/dashboard` — portfolio health
- `/projects` — all WIP
- `/reports` or `/admin` — leadership numbers

### 3. Specialist view (1.5 min)
Sign out → `demo.specialist@pimsyehr.com`:
- Only assigned projects (IMP-9001)
- Open IMP-9001 → tasks, SHARED thread vs INTERNAL back-channel (Dock can’t hide internal the same way)

### 4. Customer portal (2 min)
Private window → `contact@riverbend-counseling.example.com`:
- `/portal` — SHARED timeline, action items, messages only
- Emphasize: wrong project → **404**, not 403

### 5. Close (30 sec)
- Azure + our Postgres ≪ Dock Enterprise for API
- Gaps: no visual template editor yet; no live Dock migration; no realtime; no `.ics` yet
- Ask: pilot 1–2 WIP sites alongside Dock, then cutover

---

## Talking points vs Dock

| Dock today | PIMSY Implementations |
|---|---|
| Polished customer rooms | Customer portal + staff app |
| Template clone | Same Dock playbook, dates from kickoff |
| Threads | Shared **and** internal (promote with audit) |
| API gated / expensive | **Ours** — DB + server actions; REST easy to expose |
| PHI | Logistics only (same rule) |

---
---

## If something breaks live

- Wrong version on sign-in → wrong deploy
- Magic link not arriving → use password demos; Resend optional
- Empty demo project → `db:seed` + `demo:content` + `db:seed:demo-logins`
- Attachments missing on Azure → `AZURE_STORAGE_CONNECTION_STRING` (see `azure/README.md`)
