#!/usr/bin/env python3
"""Dump Prism Azure SQL from Azure Cloud Shell (or any host with sqlcmd).

Does not invent credentials. Export PRISM_SQL_CONNECTION_STRING from the Prism
Static Web App setting historically named SQL_CONNECTION_STRING.

    export PRISM_SQL_CONNECTION_STRING='...'
    python3 scripts/azure-cloud-shell-dump.py [prism-dump.json]
"""

from __future__ import annotations

import datetime
import json
import os
import re
import subprocess
import sys


def kv(cs: str, name: str) -> str:
    m = re.search(rf"(?i)(?:^|;){re.escape(name)}=([^;]+)", cs)
    return m.group(1).strip() if m else ""


def run_json(server: str, database: str, user: str, password: str, sql: str) -> list:
    cmd = [
        "sqlcmd",
        "-C",
        "-S",
        server,
        "-d",
        database,
        "-U",
        user,
        "-P",
        password,
        "-y",
        "0",
        "-b",
        "-Q",
        sql,
    ]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        sys.stderr.write(p.stderr or p.stdout or "sqlcmd failed\n")
        return []
    text = p.stdout.strip()
    for i, ch in enumerate(text):
        if ch in "[{":
            text = text[i:]
            break
    for end in ("\n(", "\r("):
        if end in text:
            text = text[: text.rfind(end)]
    text = text.strip()
    if not text:
        return []
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        sys.stderr.write("warning: sqlcmd output was not JSON; using []\n")
        return []
    if isinstance(data, list):
        return data
    return [data]


def main() -> int:
    cs = os.environ.get("PRISM_SQL_CONNECTION_STRING", "").strip()
    if not cs:
        sys.stderr.write(
            "Set PRISM_SQL_CONNECTION_STRING to the Prism SWA app setting SQL_CONNECTION_STRING.\n"
            "Do not invent credentials.\n"
        )
        return 1

    server = (kv(cs, "Server") or kv(cs, "Data Source")).replace("tcp:", "").split(",")[0]
    database = kv(cs, "Initial Catalog") or kv(cs, "Database") or "prism"
    user = kv(cs, "User ID") or kv(cs, "UID")
    password = kv(cs, "Password") or kv(cs, "PWD")
    if not server or not user or not password:
        sys.stderr.write("Could not parse Server / User ID / Password from the connection string.\n")
        return 1

    queries = {
        "team": "SET NOCOUNT ON; SELECT TeamId AS teamId, Name AS name, HoursPerWeek AS hoursPerWeek, Flags AS flags FROM dbo.Team FOR JSON PATH;",
        "formerTeam": "SET NOCOUNT ON; SELECT TeamId AS teamId, Name AS name FROM dbo.FormerTeam FOR JSON PATH;",
        "customers": "SET NOCOUNT ON; SELECT CustomerId, AccountName, Status, Owner, DockWorkspaceId, Data FROM dbo.Customers FOR JSON PATH;",
        "completed": "SET NOCOUNT ON; SELECT CustomerId, AccountName, Era, Data FROM dbo.CompletedImplementations FOR JSON PATH;",
    }
    doc = {
        "version": 1,
        "exportedAt": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "source": "azure-cloud-shell:pimsy-prism-sql/prism",
        "team": run_json(server, database, user, password, queries["team"]),
        "formerTeam": run_json(server, database, user, password, queries["formerTeam"]),
        "customers": run_json(server, database, user, password, queries["customers"]),
        "completed": run_json(server, database, user, password, queries["completed"]),
    }
    out = sys.argv[1] if len(sys.argv) > 1 else "prism-dump.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2)
        f.write("\n")
    sys.stderr.write(
        f"Wrote {out} ({len(doc['team'])} team, {len(doc['customers'])} customers, {len(doc['completed'])} completed)\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
