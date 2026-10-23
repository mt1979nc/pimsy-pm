# PATH v1.18.28 archive

Phase 0 of the rebuild hides modules. It does not delete code, routes, or database tables.

The archive point is git tag `archive/v1.18.28`, on commit `350974804280179864d7abbe46bc3e64e6e4b929` (v1.18.28, 13 Oct 2026). That commit is the app before this archive change.

## Restore the v1.18.28 tree

```bash
git fetch origin tag archive/v1.18.28
git checkout archive/v1.18.28
```

To put that tree on a branch:

```bash
git checkout -b restore-v1.18.28 archive/v1.18.28
```

If the tag is not on the remote yet, create it locally on that commit and push it:

```bash
git tag archive/v1.18.28 350974804280179864d7abbe46bc3e64e6e4b929
git push origin archive/v1.18.28
```

Checking out the tag restores the source. It does not restore the database. Use a dump for that (below). Deploy is a separate step and is not part of this archive.

## Show the archived screens without checking out the tag

Archived routes are off unless `PATH_ARCHIVED_MODULES` is `1`, `true`, `yes`, or `on`. Set that on the App Service (or in `.env.local`) and restart. The same code and the same tables serve those screens again.

`PATH_DAY_TO_DAY` still applies when the archive flag is on. Day-to-day project work stays hidden until that flag is on as well.

## What is archived

Hidden from navigation, and 404, while the flag is off:

| Area | Routes |
| --- | --- |
| Customer portal | `/portal` and `/portal/*` (including Learning Center at `/portal/learn`) |
| Learning Center | `/learning` |
| Day-to-day PM | `/dashboard`, `/my-work`, `/inbox`, `/projects`, `/customers`, `/templates` |
| Executive | `/management/executive` |
| Weekly meeting | `/management/weekly` |
| Reports | `/reports` and `/reports/*` except the two redirects below |
| Admin | `/admin` |
| Library | `/library` |
| What's new | `/updates` |
| Learning and library files | `/api/learn`, `/api/library` |

Still available:

- `/management` overview, roster, team, team capacity, forecast, analysis, Dock delivery
- `/settings` and sign-in, password reset, change password
- `/reports/capacity` → `/management/capacity` and `/reports/analysis` → `/management/analysis`
- Auth, Prism snapshot, Dock delivery ingest, and cron routes

Customers who sign in land on `/portal-archived` (a short note) instead of the portal. The portal URLs themselves 404.

Staff who used to land on Portfolio (`/reports`) land on `/management`. Other staff still land on `/settings`.

## Database backup

`scripts/backup-path-db.sh` runs `pg_dump` against `DATABASE_URL`. It is documented here and is not run by the app, by CI, or by this change.

```bash
# DATABASE_URL from App Service configuration. Do not put the URL in the command.
export DATABASE_URL
bash scripts/backup-path-db.sh /tmp/path-v1.18.28.dump
```

The script writes a custom-format dump and prints the path. Restore onto the same server with:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" /tmp/path-v1.18.28.dump
```

`--clean` drops objects that exist in the dump before recreating them. Do not run that against a database you have not copied. Nothing in this repository runs that restore.

PGlite (`pglite:`) is refused. `pg_dump` needs the Postgres connection string.
