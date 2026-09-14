# Dock-replacement roadmap

Priority epics for Nathan / **PATH** (Plan · Assign · Track · Handoff). Repo remains `pimsy-pm`. Status reflects what this branch (and main) deliver.

**Product decision (Alexander):** Standalone Prism (nice-rock) must **not** remain a separate app. Fold capacity, forecast, roster, and analysis into PATH as the **Prism** module (OWNER / ADMIN / MANAGER only). Specialists keep Dock-like project execution; customers keep the portal. Do not rename the analytics module away from Prism.

**Locked priority (Alexander):** **v1.8 Prism Management** (manual roster + engagement edit) shipped — ahead of contacts / HubSpot.

## Must-have

| Epic | Status | Notes |
|------|--------|-------|
| **About / site profile** | **Shipped** (v1.7) | HubSpot deal, Prism client id, CRM acronym/key, Zoom booking, notes, custom fields. Staff edit + portal read-only. |
| **Waiting-on threads** | **Shipped** (v1.7) | `waitingOn`: PIMSY / CUSTOMER / UNKNOWN + aging. Staff badge/set; portfolio rollup of open SHARED threads; portal read-only badge. |
| **Prism Management (v1.8)** | **Shipped** (v1.8.0–1.8.4) | Team roster flags + billable hrs + engagement roster/edit in PATH. OWNER/ADMIN/MANAGER only. Native Postgres (no Prism Azure SQL dual-write). |
| **Playbook / staffing (v1.9)** | **Shipped** (v1.9.0–1.9.1) | Editable templates, four site paths, optional areas, per-project N/A, staffing roles + auto-assign + manager overview, staff-only Update History. |
| **Forecast (v1.10)** | **Shipped** | Weekly hours + peak week + headroom + hire-now; weights listed; Analysis exclusions (SENSORI/MHC/LECHRIS default). Native Postgres. |
| **Prism cutover (v1.11)** | **Shipped** (v1.11.0–1.11.2) | PATH is SoT. Import + snapshot API + add-to-roster + Analysis table. v1.11.1 restores Portfolio vs Waiting-on; v1.11.2 fixes blank Headroom bars + team load cards and adds typed delete for projects/customers. |
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

Sequence: **v1.7 About + waiting-on (shipped)** → **v1.8 Prism Management (shipped)** → **v1.9 playbook/staffing (shipped)** → **v1.10 Forecast (shipped)** → **v1.11 Prism cutover (this branch)** → **Milestone: dark standalone Prism** (Alexander confirms). Contacts / HubSpot-on-create wait.

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
| Prism sync | **Cutover (v1.11)** — one-time import; runtime reads PATH only (`/api/prism/snapshot`) |
| Permissions | Partial (role + membership; finer ACL remaining) |
| Mobile portal | Planned |

## Later

| Epic | Status |
|------|--------|
| RCM (full forecast/analysis) | Later — v1.9 ships RCM *playbook paths* only |
| Health score | Later |
| In-app daily review | Later |
| SSO | Later |
