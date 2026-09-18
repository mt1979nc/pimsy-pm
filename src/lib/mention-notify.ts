/**
 * Notify people @mentioned in a comment or project update.
 * Uses the existing MENTIONED in-app + email path (same as messages).
 */

import { isCustomer, type Actor } from "@/lib/authz";
import { listMentionCandidates } from "@/lib/mention-candidates";
import { mentionPlainText, uniqueMentionUserIds } from "@/lib/mentions";
import { notify } from "@/lib/notify";

export async function notifyBodyMentions(opts: {
  actor: Actor;
  projectId: string;
  texts: string[];
  previousTexts?: string[];
  visibility: "INTERNAL" | "SHARED";
  quote?: string;
  linkUrl: string;
  portalLinkUrl: string;
  ctaLabel?: string;
  projectName?: string;
}) {
  const combined = opts.texts.filter(Boolean).join("\n");
  const ids = uniqueMentionUserIds(combined);
  if (ids.length === 0) return;

  const previous = new Set(uniqueMentionUserIds((opts.previousTexts ?? []).filter(Boolean).join("\n")));
  const fresh = ids.filter((id) => !previous.has(id) && id !== opts.actor.id);
  if (fresh.length === 0) return;

  const audience = isCustomer(opts.actor) ? "portal" : "staff";
  const candidates = await listMentionCandidates(opts.projectId, audience);
  const allowed = new Set(
    candidates
      .filter((c) => opts.visibility === "SHARED" || c.kind !== "customer")
      .map((c) => c.id),
  );
  const userIds = fresh.filter((id) => allowed.has(id));
  if (userIds.length === 0) return;

  const quoteText = mentionPlainText(opts.quote ?? combined).slice(0, 400);

  await notify({
    userIds,
    type: "MENTIONED",
    title: `${opts.actor.name ?? opts.actor.email} mentioned you`,
    quote: { author: opts.actor.name ?? opts.actor.email ?? "Someone", text: quoteText },
    facts: opts.projectName ? [{ name: "Project", value: opts.projectName }] : undefined,
    linkUrl: opts.linkUrl,
    portalLinkUrl: opts.portalLinkUrl,
    ctaLabel: opts.ctaLabel ?? "Open",
    email: true,
    exceptUserId: opts.actor.id,
  });
}
