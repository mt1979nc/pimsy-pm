import { requireStaff } from "@/lib/guard";
import { APP_VERSION, staffUpdateHistory } from "@/lib/version";
import { fmtDate } from "@/lib/dates";
import { PageHeader, Card, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Update History" };

export default async function UpdatesPage() {
  await requireStaff();
  const notes = staffUpdateHistory();

  return (
    <>
      <PageHeader
        title="Update History"
        subtitle="What shipped in this workspace. Staff only — customers never see this page."
        actions={<Badge tone="brand">v{APP_VERSION}</Badge>}
      />

      <ol className="mx-auto max-w-[720px] space-y-3">
        {notes.map((note, index) => {
          const current = note.version === APP_VERSION;
          return (
            <li key={note.version}>
              <Card
                className={cn(current && "border-[#113c64]/25 ring-1 ring-[#113c64]/15")}
              >
                <article className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                      v{note.version}
                    </h2>
                    {current ? <Badge tone="brand">Current</Badge> : null}
                    {index === 0 && !current ? <Badge tone="amber">Notes ahead of build</Badge> : null}
                    <time
                      dateTime={note.date}
                      className="ml-auto text-[12.5px] text-ink-3"
                    >
                      {fmtDate(`${note.date}T12:00:00`)}
                    </time>
                  </div>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{note.summary}</p>
                  {note.highlights && note.highlights.length > 0 ? (
                    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-2">
                      {note.highlights.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              </Card>
            </li>
          );
        })}
      </ol>
    </>
  );
}
