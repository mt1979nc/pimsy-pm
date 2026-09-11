# Dock-replacement roadmap

Priority epics for Nathan / PIMSY Implementations. Status reflects what this branch (and main) deliver.

**Product decision (Alexander):** Prism must **not** remain a separate app. Fold capacity, forecast, roster, and analysis into pimsy-pm as **Management-role features** (OWNER / ADMIN / MANAGER only). Specialists keep Dock-like project execution; customers keep the portal.

**Locked priority (Alexander):** **v1.8 Prism Management** (manual roster + engagement edit) ships on this branch — ahead of contacts / HubSpot.

## Must-have

| Epic | Status | Notes |
|------|--------|-------|
| **About / site profile** | **Shipped** (v1.7) | HubSpot deal, Prism client id, CRM acronym/key, Zoom booking, notes, custom fields. Staff edit + portal read-only. |
| **Waiting-on threads** | **Shipped** (v1.7) | `waitingOn`: PIMSY / CUSTOMER / UNKNOWN + aging. Staff badge/set; portfolio rollup of open SHARED threads; portal read-only badge. |
| **Prism Management (v1.8)** | **In progress / shipping** (this branch → v1.8.0) | Team roster flags + billable hrs + engagement roster/edit in PM. OWNER/ADMIN/MANAGER only. Native Postgres (no Prism Azure SQL dual-write). |
| Contacts + Zoom booking | Planned (after v1.8) | Contact roles, booking links wired into About + invite flows. |
| HubSpot on create | Planned (after v1.8) | Capture deal URL / deal id when creating a project from a win. |
| Portfolio WIP view | Planned | Callouts powered by waiting-on rollup + customer-side tasks. |

## Milestone: Retire standalone Prism

**Destination:** retire standalone Prism (purple-beach) after parity in pimsy-pm. Management-only; specialists and customers are unchanged.

| Step | Version / gate | Status | Scope |
|------|----------------|--------|-------|
| 1. Management hub | **v1.8** | **Shipping** (this branch) | Capacity settings + team roster / flags + engagement edit. Native Postgres (not dual-write Prism SQL). OWNER/ADMIN/MANAGER only. |
| 2. Forecast | **v1.9** | Planned | Weights, Hire now, exclusions — forecast parity with Prism. |
| 3. Dual-read | After v1.9 | Planned | Point Director / Pipeline routines at pimsy-pm; **dual-read Prism DB before any write cutover**. |
| 4. Write cutover | After dual-read proven | Planned | Writes land only in pimsy-pm; Prism becomes read-only fallback then dark. |
| 5. **Retire standalone Prism** | After cutover | Planned | Archive / shut down purple-beach once Management Capacity → Forecast → routines are live in pimsy-pm. |

Sequence: **v1.7 About + waiting-on (shipped)** → **v1.8 Prism Management (this branch)** → v1.9 Forecast → dual-read → write cutover → **Milestone: Retire standalone Prism**. Contacts / HubSpot-on-create wait until after v1.8.

## Demo polish

| Epic | Status |
|------|--------|
| Status updates feed | Planned |
| Zoom recordings sync | Planned |
| Template reseed | Planned |
| Mentions / notify | Partial (exists; polish remaining) |
| File library by area | Planned |

## Ops

| Epic | Status |
|------|--------|
| Thin read API | Planned |
| Activity log | Partial (audit log exists; UI polish remaining) |
| Multi-assignee / coverage | Planned |
| Prism sync | Superseded by **Milestone: Retire standalone Prism** (one-time import remains; ongoing sync → dual-read then cutover) |
| Permissions | Partial (role + membership; finer ACL remaining) |
| Mobile portal | Planned |

## Later

| Epic | Status |
|------|--------|
| RCM | Later |
| Health score | Later |
| In-app daily review | Later |
| SSO | Later |
