"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { LearningItemView } from "@/lib/learning-center";
import { LEARNING_AUDIENCE_LABEL, learningKindLabel, type LearningAudience } from "@/db/learning-center-catalog";

type Section = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  topic: string;
  topicLabel: string;
  audienceRole: string;
  items: LearningItemView[];
};

export function LearningCatalog({
  sections,
  itemHref,
  emptyHint,
}: {
  sections: Section[];
  itemHref: (item: LearningItemView) => string;
  emptyHint: string;
}) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | LearningAudience>("all");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return sections
      .map((section) => {
        const items = section.items.filter((item) => {
          if (role !== "all" && item.audienceRole !== "all" && item.audienceRole !== role) {
            return false;
          }
          if (!query) return true;
          const hay = [
            item.title,
            item.summary,
            item.body,
            item.sectionTitle,
            item.topicLabel,
            item.audienceRole,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(query);
        });
        return { ...section, items };
      })
      .filter((s) => s.items.length > 0);
  }, [sections, q, role]);

  const roles: Array<"all" | LearningAudience> = ["all", "clinical", "billing", "admin"];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search topics, trainings, worksheets…"
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-[14px] text-ink"
        />
        <div className="flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={cn(
                "rounded-full px-3 py-1 text-[12.5px] font-medium",
                role === r ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-2 hover:text-ink",
              )}
            >
              {r === "all" ? "All roles" : LEARNING_AUDIENCE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">{emptyHint}</p>
        </Card>
      ) : (
        filtered.map((section) => (
          <section key={section.id} id={section.slug} className="space-y-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[16px] font-semibold tracking-tight text-ink">{section.title}</h2>
                <Badge>{section.topicLabel}</Badge>
              </div>
              {section.description ? (
                <p className="mt-1 text-[13px] text-ink-2">{section.description}</p>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {section.items.map((item) => (
                <Link
                  key={item.id}
                  href={itemHref(item)}
                  className="block rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(15,20,30,0.04)] hover:border-brand"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge>{learningKindLabel(item.kind)}</Badge>
                    {item.audienceRole !== "all" ? (
                      <Badge>
                        {LEARNING_AUDIENCE_LABEL[item.audienceRole as LearningAudience] ?? item.audienceRole}
                      </Badge>
                    ) : null}
                    {item.isPlaceholder && item.kind === "FILE" ? (
                      <Badge tone="amber">File pending</Badge>
                    ) : null}
                  </div>
                  <h3 className="mt-2 text-[14.5px] font-semibold leading-snug text-ink">{item.title}</h3>
                  {item.summary ? (
                    <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-ink-2">{item.summary}</p>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
