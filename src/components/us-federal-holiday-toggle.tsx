"use client";

export function UsFederalHolidayToggle({
  checked,
  onChange,
  holidayDays = 0,
  name = "skipUsFederalHolidays",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  holidayDays?: number;
  name?: string;
}) {
  return (
    <div>
      <input type="hidden" name={name} value={checked ? "1" : "0"} />
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
        />
        <span>
          <span className="block text-[13px] font-medium text-ink">Account for US federal holidays</span>
          <span className="block text-[12px] text-ink-3">
            {checked
              ? holidayDays > 0
                ? `On — projected go-live is ${holidayDays} day${holidayDays === 1 ? "" : "s"} later so observed US federal holidays in this window are not treated as work days.`
                : "On — Thanksgiving, Christmas, New Year’s, and other observed US federal holidays are skipped in the projected window."
              : "Off — Prism-parity calendar math (weekends count; federal holidays are treated as ordinary days)."}
          </span>
        </span>
      </label>
    </div>
  );
}
