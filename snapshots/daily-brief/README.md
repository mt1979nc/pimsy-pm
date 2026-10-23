# Daily brief snapshots

This folder is the drop location for `npm run db:backfill:daily-brief` and for the **PATH data jobs** GitHub Action. It is empty on purpose.

Do not commit customer snapshots. `dock-wip`, `dock-threads`, `delivery-status`, `prism-live`, `prism.json`, and `zendesk` captures stay out of git. Synthetic fixtures used by tests live under `tests/fixtures/daily-brief/`.

## Layout

One folder per day, or flat dated names in one directory:

```
snapshots/daily-brief/2026-09-08/dock-wip.json
snapshots/daily-brief/2026-09-08/dock-threads.json
snapshots/daily-brief/2026-09-08/delivery-status.json
snapshots/daily-brief/2026-09-08/prism.json
snapshots/daily-brief/2026-09-08/prism-live.md
snapshots/daily-brief/2026-09-08/zendesk.json
```

`prism-live-YYYY-MM-DD.md` works in the day folder or next to the flat JSON files. A `dock-wip` or `dock-threads` file with `"gap": true` is stored as a gap. A Dock WIP file with no `dock-threads.json` is a gap (missing thread data).

## Local dry-run

Point `--dir` at a folder you keep outside the repo, or at a private checkout of this directory:

```
npm run db:backfill:daily-brief -- --dir ./snapshots/daily-brief
npm run db:backfill:daily-brief -- --dir ./snapshots/daily-brief --from 2026-09-08 --to 2026-10-23 --apply
```

The command prints a dry-run until `--apply`.

## PATH data jobs

Actions → **PATH data jobs** (`workflow_dispatch`).

| Input | Meaning |
| --- | --- |
| `job` | `prism-diff` or `daily-brief-backfill` |
| `apply` | Default false. Backfill writes only when this is true. `prism-diff` never passes `--apply`. |
| `artifact_name` | Name of an existing Actions artifact that holds the files. Leave empty to use this folder from the commit. |
| `artifact_run_id` | Run id that published `artifact_name`. Required when `artifact_name` is set. |

Upload the artifact from a private run, or with `gh` against a workflow you already trust. Do not add the files to this repository.

- **Backfill artifact.** The artifact root is the snapshot directory: day folders (`2026-09-08/dock-wip.json`) or flat names (`dock-wip-2026-09-08.json`). The job runs `npm run db:backfill:daily-brief -- --dir <that folder>`. It opens the database firewall only when `apply` is true.
- **Prism diff artifact.** The artifact must contain `prism-dump.json` (from `npm run db:dump:prism -- --out prism-dump.json`). The job runs `npm run db:import:prism-diff` in dry-run and uploads `prism-diff-report`.

With `artifact_name` empty, backfill reads this committed folder (documentation only, unless you add files on a private branch you do not push). Prism diff then looks for `prism-dump.json` in the repo root and fails if it is not there.
