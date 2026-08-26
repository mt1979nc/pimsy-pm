import { Resend } from "resend";
import { env } from "./env";

const resend = env.EMAIL_ENABLED ? new Resend(env.RESEND_API_KEY) : null;

type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

/**
 * Sends mail through Resend. When RESEND_API_KEY is absent (local dev), the
 * message is logged to the server console instead so magic-link sign-in still
 * works without any email setup.
 */
export async function sendEmail({ to, subject, html, text, replyTo }: SendArgs) {
  if (!resend) {
    console.info("\n──────── EMAIL (dev, not sent) ────────");
    console.info("To:      ", Array.isArray(to) ? to.join(", ") : to);
    console.info("Subject: ", subject);
    console.info(text ?? stripHtml(html));
    console.info("───────────────────────────────────────\n");
    return { id: "dev-console", skipped: true as const };
  }

  const result = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: text ?? stripHtml(html),
    ...(replyTo ? { replyTo } : {}),
  });

  if (result.error) {
    console.error("Resend error:", result.error);
    throw new Error(`Failed to send email: ${result.error.message}`);
  }
  return { id: result.data?.id ?? "", skipped: false as const };
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Templates
//
// These are written for Outlook first, because that is where they land.
// Desktop Outlook renders HTML with Word's engine, which means:
//   - padding on an inline <a> is ignored, so a styled link collapses to plain
//     text. Buttons are therefore a <table> with the padding on the <td>, with
//     a VML rounded rectangle behind it for the rounded corners.
//   - line-height needs `mso-line-height-rule:exactly` or it drifts.
//   - system font stacks fall back to Times New Roman, so mso gets Segoe UI.
//   - max-width is unreliable, so the shell is a fixed-width table.
// Everything degrades to a readable single column in clients that ignore all
// of the above.
// ---------------------------------------------------------------------------

const BRAND = "#113c64"; // PIMSY Dark Blue — PIMSY Brand Guidelines, Aug 2025
const FONTS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Label/value rows — "Project", "Assigned by", "Due". */
export type Fact = { name: string; value: string };

export type LayoutOpts = {
  heading: string;
  /** Raw HTML, already escaped by the caller. Prefer `paragraphs`. */
  body?: string;
  /** Plain strings; escaped and wrapped for you. */
  paragraphs?: string[];
  facts?: Fact[];
  /** A quoted excerpt — a message body or comment. Rendered set apart. */
  quote?: { author: string; text: string };
  cta?: { label: string; url: string };
  footer?: string;
};

function factTable(facts: Fact[]) {
  const rows = facts
    .map(
      (f) => `<tr>
            <td width="1%" style="padding:6px 20px 6px 0;font-size:13px;line-height:20px;color:#8b939c;white-space:nowrap;vertical-align:top;">${escapeHtml(f.name)}</td>
            <td style="padding:6px 0;font-size:13px;line-height:20px;color:#1f2328;vertical-align:top;">${escapeHtml(f.value)}</td>
          </tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0 0;border-top:1px solid #eef0f3;padding-top:4px;">${rows}</table>`;
}

function button(label: string, url: string) {
  const safe = escapeHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
              <tr><td align="center" bgcolor="${BRAND}" style="border-radius:8px;">
                <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safe}" style="height:44px;v-text-anchor:middle;width:260px;" arcsize="18%" stroke="f" fillcolor="${BRAND}"><w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:600;"><![endif]-->
                <a href="${safe}" style="display:inline-block;padding:13px 26px;font-family:${FONTS};font-size:15px;font-weight:600;line-height:18px;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
                <!--[if mso]></center></v:roundrect><![endif]-->
              </td></tr>
            </table>`;
}

export function layout(opts: LayoutOpts) {
  const paras = (opts.paragraphs ?? [])
    .map(
      (p) =>
        `<p style="margin:0 0 14px;mso-line-height-rule:exactly;line-height:24px;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const quote = opts.quote
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0 0;">
                 <tr>
                   <td width="3" bgcolor="#dfe3e8" style="width:3px;line-height:1px;font-size:0;">&nbsp;</td>
                   <td style="padding:2px 0 2px 14px;">
                     <div style="font-size:12px;line-height:18px;color:#8b939c;margin:0 0 4px;">${escapeHtml(opts.quote.author)}</div>
                     <div style="font-size:14px;line-height:22px;color:#3d444d;mso-line-height-rule:exactly;">${escapeHtml(opts.quote.text).replace(/\n/g, "<br>")}</div>
                   </td>
                 </tr>
               </table>`
    : "";

  return `<!doctype html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <!--[if mso]>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
    <style>body,table,td,p,h1,a{font-family:'Segoe UI',Arial,sans-serif !important;}</style>
    <![endif]-->
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:${FONTS};color:#1f2328;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
          <tr><td style="padding:22px 32px;border-bottom:1px solid #eef0f3;">
            <span style="font-weight:700;font-size:15px;letter-spacing:-0.01em;color:${BRAND};">PIMSY Implementations</span>
          </td></tr>
          <tr><td style="padding:30px 32px;">
            <h1 style="margin:0 0 14px;font-size:20px;line-height:28px;font-weight:600;mso-line-height-rule:exactly;">${escapeHtml(opts.heading)}</h1>
            <div style="font-size:15px;line-height:24px;color:#3d444d;">${paras}${opts.body ?? ""}</div>
            ${quote}
            ${opts.facts?.length ? factTable(opts.facts) : ""}
            ${opts.cta ? button(opts.cta.label, opts.cta.url) : ""}
            ${
              opts.cta
                ? `<p style="margin:14px 0 0;font-size:12px;line-height:18px;color:#8b939c;word-break:break-all;">Or paste this into your browser:<br>${escapeHtml(opts.cta.url)}</p>`
                : ""
            }
          </td></tr>
          <tr><td style="padding:16px 32px;border-top:1px solid #eef0f3;font-size:12px;line-height:18px;color:#8b939c;">
            ${opts.footer ?? "This message relates to your PIMSY implementation project. It contains no patient information."}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * The plain-text alternative, built from the same structured input rather than
 * scraped back out of the HTML. This is what shows in a phone's notification
 * preview and in the Outlook reading-pane snippet, so it is worth being real.
 */
export function plainText(opts: LayoutOpts): string {
  const out: string[] = [opts.heading, ""];
  for (const p of opts.paragraphs ?? []) out.push(p, "");
  if (opts.quote) {
    out.push(`${opts.quote.author}:`);
    for (const line of opts.quote.text.split("\n")) out.push(`  > ${line}`);
    out.push("");
  }
  for (const f of opts.facts ?? []) out.push(`${f.name}: ${f.value}`);
  if (opts.facts?.length) out.push("");
  if (opts.cta) out.push(`${opts.cta.label}: ${opts.cta.url}`, "");
  out.push("—", opts.footer ?? "Contains no patient information.");
  return out.join("\n");
}

export function signInEmail(url: string, isCustomer: boolean) {
  return layout({
    heading: "Your sign-in link",
    paragraphs: [
      isCustomer
        ? "Click below to open your implementation workspace. The link works once and expires in 24 hours."
        : "Click below to sign in. The link works once and expires in 24 hours.",
    ],
    cta: { label: "Sign in", url },
    footer: "If you didn't request this, you can safely ignore it.",
  });
}

export function passwordResetEmail(url: string, hasExistingPassword: boolean) {
  return layout({
    heading: hasExistingPassword ? "Reset your password" : "Set a password",
    paragraphs: [
      hasExistingPassword
        ? "Click below to choose a new password. This link works once and expires in 1 hour."
        : "Click below to set a password for signing in. This link works once and expires in 1 hour.",
      "You can still always sign in with an emailed link instead — this is optional.",
    ],
    cta: { label: hasExistingPassword ? "Reset password" : "Set password", url },
    footer: "If you didn't request this, you can safely ignore it — your account is unchanged.",
  });
}
