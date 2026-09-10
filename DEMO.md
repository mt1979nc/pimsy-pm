# Nathan demo — PIMSY Implementations (Dock replacement)

**Live:** https://pimsy-app.azurewebsites.net  
**Repo:** https://github.com/mt1979nc/pimsy-pm  
**Version:** v1.6.0  
**Pitch in one line:** Same Implementation playbook as Dock, with an internal back-channel Dock can’t do, plus an API we own — without Dock Enterprise (~$1k/mo) pricing.

This app holds **no PHI** (logistics only). Footer on sign-in says so.

---

## Before you present (5 minutes)

1. Confirm sign-in shows **v1.6.0**.
2. 2. Sign in as staff (`alexander@pimsyehr.com` or another `@pimsyehr.com` account).
   3. 3. Open project **IMP-9001** (or the demo customer from seed). If screens look empty:
      4.    - Local: `npm run setup` then `npm run demo:content`
            -    - Azure: ensure demo seed + `demo:content` were run against production Postgres (not `--templates-only` only).
                 - 4. Have a **second browser / private window** ready for the customer portal view (invite a portal contact or use the seeded contact).
                   5. 5. Optional: Management → Alerts → show Teams webh
                      6.
                      7. ### 3. One Implementation workspace (3 min)
                      8. Open **IMP-9001**:
                      9. - **Phases / tasks** — Dock Implementation template ported (12 phases, 143 tasks, milestones).
                         - - **Task detail** — comments + attachments with **INTERNAL vs SHARED** visibility.
                           - - **Messages** — show a **SHARED** thread with the customer, then an **INTERNAL** thread (Dock cannot hide an internal back-channel the same way).
                             - - **Settings** — portal enabled, contacts, kickoff-driven plan.
                               -
                               - ### 4. Customer portal (2 min)
                               - Private window → `/portal`:
                               - - Customer sees only **SHARED** timeline, action items, messages, documents, recordings.
                                 - - Named customer owner on a task appears as *their* action item.
                                   - - Emphasize: wrong project → **404**, not 403 (no existence leak).
                                     -
                                     - ### 5. Leadership / ops (1 min)
                                     - - `/reports` or `/admin` — portfolio, at-risk, capacity.
                                       - - Contrast with Dock: this is **our** Postgres + Next.js — agents and Prism can integrate without scraping.
                                         -
                                         - ### 6. Close (30 sec)
                                         - - Cost path: Azure App Service + Postgres + Resend + Blob ≪ Dock Enterprise for API.
                                           - - Honest gaps (don’t hide): no visual template editor yet; no live Dock migration; no realtime push; no `.ics` calendar invites yet.
                                             - - Ask: green-light pilot 1–2 WIP sites alongside Dock, then cutover.
                                               -
                                               ---
                                            
                                               ## If something breaks live
                                            
                                               - Wrong version on sign-in → wrong deploy slot / old App Service.
                                               - - Magic link not arriving → Resend / `EMAIL_FROM` / check spam; locally links go to `SIGN-IN-LINK.txt`.
                                                 - - Empty demo project → re-run seed + `demo:content` on that database.
                                                   - - File attachments missing on Azure → need `AZURE_STORAGE_CONNECTION_STRING` (see `azure/README.md`).
                                                    
                                                     - ---
                                            
                                                     ## After Nathan says yes
                                            
                                                     1. Expose a thin read API (`/api/v1/sites`, tasks, threads) for morning snapshot / Outlook folder prep bots.
                                                     2. 2. Pilot FBH or OCE (or a safe WIP) in parallel with Dock.
                                                        3. 3. Visual template editor + `.ics` for training dates.
                                                           4. 4. Optional: Entra SSO for staff (Google SSO already optional).
                                                              5. 
                                               - ---
                                               -
                                               - ## Talking points vs Dock
                                               -
                                               - | Dock today | PIMSY Implementations |
                                               - |---|---|
                                               - | Polished customer rooms | Customer portal + staff app |
                                               - | Template clone | Same Dock playbook, dates from kickoff |
                                               - | Threads | Shared **and** internal (promote with audit) |
                                               - | API | Gated / expensive | **Ours** — DB + server actions today; REST easy to expose |
                                               - | PHI risk | Same rule: logistics only |
                                               - ook is available (don’t need it live).
                     
                      10. ---
                     
                      11. ## 8-minute click path
                     
                      12. ### 1. Problem (30 sec)
                      13. - Dock is our customer Implementation hub today.
                         - - Portfolio reports and bots scrape the UI because **API is Enterprise / early-access**.
                           - - We need portals + tasks + threads **and** first-class data access under our control.
                            
                             - ### 2. Staff home (1 min)
                             - - `/dashboard` — portfolio health at a glance.
                               - - `/projects` — WIP list (codes, customers, status).
                                 - - Point at **chase list / My Work** if demos are seeded with customer-owned tasks.
                                   - 
