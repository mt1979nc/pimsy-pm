import {
  ANALYTICS_EXCLUDE_HINT,
  ANALYTICS_EXCLUDE_LABEL,
} from "@/lib/analytics-exclude";

/** Staff checkbox for create/edit customer and project forms. No DB imports. */
export function AnalyticsExcludeToggle({
  defaultChecked = false,
  id = "excludeFromAnalytics",
}: {
  defaultChecked?: boolean;
  id?: string;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <input type="hidden" name="excludeFromAnalyticsPresent" value="1" />
      <label className="flex items-start gap-2.5" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          name="excludeFromAnalytics"
          defaultChecked={defaultChecked}
          className="mt-0.5 size-4 rounded border-border-strong"
        />
        <span>
          <span className="block text-[13.5px] font-medium text-ink">{ANALYTICS_EXCLUDE_LABEL}</span>
          <span className="block text-[12.5px] text-ink-3">{ANALYTICS_EXCLUDE_HINT}</span>
        </span>
      </label>
    </div>
  );
}
