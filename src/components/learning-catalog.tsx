"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { LearningItemView } from "@/lib/learning-center";
import {
  LEARNING_AUDIENCE_LABEL,
  learningKindLabel,
  learningPlaceholderLabel,
  type LearningAudience,
} from "@/db/learning-center-catalog";

type Section = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  topic: string;
  topicLabel: string;
  audienceRole: string;
  order?: number;
  items: LearningItemView[];
};

export function LearningCatalog({
  sections,
  emptyHint,
  hrefPrefix = "/learning",
}: {
  sections: Section[];
  emptyHint: string;
  hrefPrefix?: string;
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
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
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
              {r === "all" ? "All" : LEARNING_AUDIENCE_LABEL[r]}
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
            <h2 className="text-[16px] font-semibold tracking-tight text-ink">{section.title}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {section.items.map((item) => (
                <Link
                  key={item.id}
                  href={`${hrefPrefix}/${item.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:border-brand"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge>{learningKindLabel(item.kind, item.url)}</Badge>
                      {item.isPlaceholder ? (
                        <Badge tone="amber">{learningPlaceholderLabel(item.kind)}</Badge>
                      ) : null}
                    </div>
                    <h3 className="mt-1 truncate text-[14.5px] font-semibold text-ink">{item.title}</h3>
                  </div>
                  <span className="shrink-0 text-[12.5px] font-medium text-brand">Open</span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
