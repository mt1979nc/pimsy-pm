import Link from "next/link";
import { Card, CardHeader, Badge } from "@/components/ui";
import { fmtDateTime, fmtRelative } from "@/lib/dates";
import {
  formatSessionDuration,
  type PimsyLoginConfirmation,
} from "@/lib/pimsy-audit-feed";

function statusBadge(status: PimsyLoginConfirmation["feed"]["status"]) {
  if (status === "ok") return <Badge tone="green">Live feed</Badge>;
  if (status === "error") return <Badge tone="red">Feed error</Badge>;
  if (status === "missing_site_key") return <Badge tone="amber">Missing site key</Badge>;
  return <Badge tone="amber">Not connected</Badge>;
}

export function PimsyLoginConfirmationCard({
  projectId,
  confirmation,
}: {
  projectId: string;
  confirmation: PimsyLoginConfirmation;
}) {
  const { feed, contacts, sessions, siteKey, crmKey, expectedUserCount, windowDays } = confirmation;
  const uniqueUsers = new Set(
    sessions.map((s) => (s.username || s.displayName || "").toLowerCase()).filter(Boolean),
  ).size;

  return (
    <Card>
      <CardHeader
        title="PIMSY EHR logins"
        subtitle={`Who signed into the EHR (not this portal) in the last ${windowDays} days, and for how long.`}
        action={statusBadge(feed.status)}
      />
      <div className="space-y-4 px-5 py-4">
        <p className="text-[13px] leading-relaxed text-ink-2">{feed.message}</p>

        <dl className="grid gap-2 text-[12.5px] sm:grid-cols-2">
          <div className="flex justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
            <dt className="text-ink-3">Site key</dt>
            <dd className="font-medium text-ink">{siteKey ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
            <dt className="text-ink-3">CRM key</dt>
            <dd className="font-medium text-ink">{crmKey ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
            <dt className="text-ink-3">Forecast+ users</dt>
            <dd className="font-medium text-ink">{expectedUserCount ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
            <dt className="text-ink-3">EHR users in window</dt>
            <dd className="font-medium text-ink">{feed.status === "ok" ? uniqueUsers : "—"}</dd>
          </div>
        </dl>

        <section>
          <h3 className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-3">
            Named PATH contacts
          </h3>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            Last seen here is PATH portal sign-in. It is not proof they logged into PIMSY.
          </p>
          {contacts.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-3">
              No portal contacts on this customer yet. Invite them from the customer page, or
              confirm trainers in the live PIMSY audit log.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {contacts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-ink">
                      {c.name?.trim() || c.email}
                    </div>
                    <div className="truncate text-[12px] text-ink-3">{c.email}</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 text-[12px]">
                    {c.matchedEhrSession ? (
                      <Badge tone="green">Seen in EHR feed</Badge>
                    ) : (
                      <Badge>Not in EHR feed</Badge>
                    )}
                    <span className="text-ink-3">
                      PATH: {c.lastSeenAt ? `seen ${fmtRelative(c.lastSeenAt)}` : "never signed in"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-3">
            EHR sessions (who · duration)
          </h3>
          {sessions.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-3">
              No EHR login rows to show. PATH will not invent sample users or session times.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {sessions.map((s, i) => (
                <li
                  key={`${s.username ?? s.displayName ?? "session"}-${s.loggedInAt}-${i}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-ink">
                      {s.displayName || s.username}
                    </div>
                    <div className="truncate text-[12px] text-ink-3">
                      {s.username && s.displayName && s.username !== s.displayName ? `${s.username} · ` : null}
                      {fmtDateTime(s.loggedInAt)}
                    </div>
                  </div>
                  <div className="text-[13px] font-medium text-ink">
                    {formatSessionDuration(s.durationSeconds)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-[12.5px] text-ink-3">
          Check this task off when the named trainers are in. Leave a comment if anyone is blocked.
          Site keys live on{" "}
          <Link href={`/projects/${projectId}/about`} className="text-brand hover:underline">
            About
          </Link>
          . Feed setup:{" "}
          <code className="text-[12px]">PIMSY_AUDIT_FEED_URL</code> (see{" "}
          <code className="text-[12px]">v1.14-PIMSY-LOGIN-AUDIT.md</code>).
        </p>
      </div>
    </Card>
  );
}
