"use client";

import { useActionState, useState, useTransition } from "react";
import {
  updateMyAlerts,
  resetMyAlerts,
  updateOrgAlertDefaults,
  updateAlertsForUser,
  restoreOrgDefaults,
} from "@/actions/notifications";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Button, Badge } from "@/components/ui";

export type AlertType = {
  type: string;
  label: string;
  description: string;
};

function Toggle({
  name,
  defaultChecked,
  label,
  description,
  disabled,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-ink">{label}</span>
        <span className="block text-[12.5px] leading-snug text-ink-3">{description}</span>
      </span>
    </label>
  );
}

/**
 * One person's own alert preferences. Used by staff in Settings and by
 * customer contacts in the portal — the copy adapts, the mechanics don't.
 */
export function MyAlertSettings({
  types,
  prefs,
  usingDefaults,
  audienceNote,
}: {
  types: AlertType[];
  prefs: { emailEnabled: boolean; types: Record<string, boolean | undefined> };
  usingDefaults: boolean;
  audienceNote: string;
}) {
  const [state, action] = useActionState(updateMyAlerts, {});
  const [emailOn, setEmailOn] = useState(prefs.emailEnabled);
  const [pending, start] = useTransition();

  return (
    <form action={action}>
      <FormError error={state.error} />
      {state.ok ? (
        <p className="mx-5 mt-4 rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">
          Saved.
        </p>
      ) : null}

      <div className="border-b border-border px-5 py-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="emailEnabled"
            checked={emailOn}
            onChange={(e) => setEmailOn(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
          />
          <span>
            <span className="block text-[13.5px] font-medium text-ink">Email me about activity</span>
            <span className="block text-[12.5px] leading-snug text-ink-3">
              {audienceNote} Turn this off and you&apos;ll still see everything in the app — you
              just won&apos;t get email.
            </span>
          </span>
        </label>
        {usingDefaults ? (
          <div className="mt-2.5">
            <Badge>Using the defaults</Badge>
          </div>
        ) : null}
      </div>

      <div
        className={emailOn ? "divide-y divide-border" : "divide-y divide-border opacity-45"}
        aria-hidden={!emailOn}
      >
        {types.map((t) => (
          <Toggle
            key={t.type}
            name={`type.${t.type}`}
            defaultChecked={prefs.types[t.type] ?? true}
            label={t.label}
            description={t.description}
            disabled={!emailOn}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending || usingDefaults}
          onClick={() => start(async () => void (await resetMyAlerts()))}
        >
          Back to defaults
        </Button>
        <SubmitButton pendingLabel="Saving…">Save alert settings</SubmitButton>
      </div>
    </form>
  );
}

/** Org-wide defaults for one side of the house. Admins only. */
export function OrgDefaultsForm({
  scope,
  types,
  prefs,
}: {
  scope: "staff" | "customer";
  types: AlertType[];
  prefs: { emailEnabled: boolean; types: Record<string, boolean | undefined> };
}) {
  const [state, action] = useActionState(updateOrgAlertDefaults, {});
  const [pending, start] = useTransition();

  return (
    <form action={action}>
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="emailEnabled" value="on" />
      <FormError error={state.error} />
      {state.ok ? (
        <p className="mx-5 mt-4 rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">
          Defaults saved.
        </p>
      ) : null}

      <div className="divide-y divide-border">
        {types.map((t) => (
          <Toggle
            key={t.type}
            name={`type.${t.type}`}
            defaultChecked={prefs.types[t.type] ?? true}
            label={t.label}
            description={t.description}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => start(async () => void (await restoreOrgDefaults(scope)))}
        >
          Restore recommended
        </Button>
        <SubmitButton pendingLabel="Saving…">Save defaults</SubmitButton>
      </div>
    </form>
  );
}

/** Admin editing one person's preferences. */
export function UserAlertOverride({
  userId,
  userName,
  types,
  prefs,
  usingDefaults,
}: {
  userId: string;
  userName: string;
  types: AlertType[];
  prefs: { emailEnabled: boolean; types: Record<string, boolean | undefined> };
  usingDefaults: boolean;
}) {
  const [state, action] = useActionState(updateAlertsForUser, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12.5px] font-medium text-brand hover:underline"
      >
        {usingDefaults ? "Set alerts" : "Edit alerts"}
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 w-full rounded-lg border border-border bg-surface">
      <input type="hidden" name="userId" value={userId} />
      <div className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold text-ink">
        Alerts for {userName}
      </div>
      <FormError error={state.error} />

      <label className="flex cursor-pointer items-start gap-3 border-b border-border px-4 py-2.5">
        <input
          type="checkbox"
          name="emailEnabled"
          defaultChecked={prefs.emailEnabled}
          className="mt-0.5 size-4 accent-[var(--color-brand)]"
        />
        <span className="text-[13px] text-ink">Email them about activity</span>
      </label>

      <div className="divide-y divide-border">
        {types.map((t) => (
          <label
            key={t.type}
            className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-surface-2"
          >
            <input
              type="checkbox"
              name={`type.${t.type}`}
              defaultChecked={prefs.types[t.type] ?? true}
              className="size-4 accent-[var(--color-brand)]"
            />
            <span className="text-[12.5px] text-ink-2">{t.label}</span>
          </label>
        ))}
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-4 py-2.5">
        <Button size="sm" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <SubmitButton size="sm">Save</SubmitButton>
      </div>
    </form>
  );
}
