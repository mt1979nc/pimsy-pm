"use client";

import { useActionState } from "react";
import { updateForecastExclusions } from "@/actions/management-forecast";
import { SubmitButton, FormError } from "@/components/submit-button";
import { DEFAULT_ANALYSIS_EXCLUSION_CODES } from "@/lib/forecast";

export function ForecastExclusionsForm({
  exclusions,
  knownCodes,
}: {
  exclusions: string[];
  knownCodes: string[];
}) {
  const [state, action] = useActionState(updateForecastExclusions, {});
  const selected = new Set(exclusions);
  const extras = exclusions.filter((c) => !knownCodes.includes(c));
  const codes = knownCodes;

  return (
    <form action={action} className="space-y-3 px-4 pb-4">
      <p className="text-[12.5px] leading-relaxed text-ink-2">
        Primary Analysis averages skip these project codes (Prism lock:{" "}
        {DEFAULT_ANALYSIS_EXCLUSION_CODES.join(", ")}). Uncheck to include them; add a code to
        exclude another outlier. Empty = exclude none.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {codes.map((code) => (
          <label key={code} className="inline-flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              name="exclusionCode"
              value={code}
              defaultChecked={selected.has(code)}
              className="size-3.5 rounded border-border-strong"
            />
            <span className="font-mono text-[12.5px]">{code}</span>
          </label>
        ))}
        {codes.length === 0 ? (
          <span className="text-[12.5px] text-ink-3">No implementation codes yet.</span>
        ) : null}
      </div>
      <div>
        <label htmlFor="exclusions" className="mb-1 block text-[12px] font-medium text-ink-3">
          Additional codes (comma or space separated)
        </label>
        <input
          id="exclusions"
          name="exclusions"
          defaultValue={extras.join(", ")}
          placeholder="e.g. OUTLIER"
          className="h-9 w-full max-w-md rounded-lg border border-border-strong bg-surface px-3 text-[13px] text-ink"
        />
      </div>
      <FormError error={state.error} />
      <SubmitButton size="sm">Save exclusions</SubmitButton>
    </form>
  );
}
