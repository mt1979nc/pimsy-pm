"use client";

import { useActionState, useState } from "react";
import { updateOrgAlertDefaults, sendTeamsTest } from "@/actions/notifications";
import { SubmitButton, FormError } from "@/components/submit-button";

export function TeamsPanel({
  enabled,
  webhookUrl,
}: {
  enabled: boolean;
  webhookUrl: string | null;
}) {
  const [saveState, saveAction] = useActionState(updateOrgAlertDefaults, {});
  const [testState, testAction] = useActionState(sendTeamsTest, {});
  const [url, setUrl] = useState(webhookUrl ?? "");

  return (
    <div className="p-5">
      <FormError error={saveState.error} />

      <p className="text-[13px] leading-relaxed text-ink-2">
        Post customer activity into a Teams channel — messages, completed action items,
        and documents added to a task. Staff-to-staff activity stays in the app; the
        channel is there so a customer doing something reaches someone who isn&apos;t
        looking at the app.
      </p>

      <details className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2">
        <summary className="cursor-pointer text-[12.5px] font-medium text-ink-2">
          How to get the webhook URL (about two minutes, no IT ticket)
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12.5px] leading-relaxed text-ink-3">
          <li>In Teams, hover the channel you want → <b>⋯</b> → <b>Workflows</b>.</li>
          <li>
            Choose <b>Post to a channel when a webhook request is received</b>.
          </li>
          <li>Confirm the team and channel, then <b>Add workflow</b>.</li>
          <li>Copy the URL it gives you and paste it below.</li>
        </ol>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
          This replaces the old &ldquo;Incoming Webhook&rdquo; connector, which Microsoft
          retired on 22 May 2026. If you find an older URL lying around it will no longer
          deliver.
        </p>
      </details>

      <form action={saveAction} className="mt-4">
        <input type="hidden" name="scope" value="teams" />

        <label className="block text-[12.5px] font-medium text-ink-2" htmlFor="teamsWebhookUrl">
          Webhook URL
        </label>
        <input
          id="teamsWebhookUrl"
          name="teamsWebhookUrl"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://prod-00.westus.logic.azure.com:443/workflows/…"
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-brand"
        />
        <p className="mt-1 text-[12px] text-ink-3">
          Only Microsoft-operated hosts are accepted. These cards can carry internal
          detail, so the destination is checked rather than trusted.
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="teamsEnabled"
            defaultChecked={enabled}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
          />
          <span>
            <span className="block text-[13.5px] font-medium text-ink">
              Post customer activity to Teams
            </span>
            <span className="block text-[12.5px] leading-snug text-ink-3">
              Email keeps working either way. This is an addition, not a replacement.
            </span>
          </span>
        </label>

        <div className="mt-4 flex items-center justify-between gap-3">
          {saveState.ok ? (
            <span className="text-[12.5px] text-green">Saved.</span>
          ) : (
            <span className="text-[12.5px] text-ink-3">
              {enabled ? "Teams posting is on." : "Teams posting is off."}
            </span>
          )}
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>
      </form>

      <form action={testAction} className="mt-4 border-t border-line pt-4">
        <input type="hidden" name="teamsWebhookUrl" value={url} />
        <FormError error={testState.error} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-ink-3">
            {testState.ok
              ? "Posted. Check the channel."
              : "Send a card to confirm it reaches the right channel."}
          </span>
          <SubmitButton size="sm" variant="secondary" pendingLabel="Sending…">
            Send a test card
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
