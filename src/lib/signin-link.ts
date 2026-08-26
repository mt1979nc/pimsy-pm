import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Development sign-in delivery.
 *
 * With no email service configured there is no inbox for a magic link to land
 * in, so it goes two places instead: printed on its own line in the terminal,
 * and written to SIGN-IN-LINK.txt in the project root. The file matters more
 * than the log — terminal output scrolls away, and a long URL wrapped across
 * several lines is miserable to copy by hand.
 */
export async function writeSignInLink(email: string, url: string) {
  const line = "═".repeat(74);
  console.log(
    [
      "",
      line,
      "  SIGN-IN LINK for " + email,
      "",
      "  Open SIGN-IN-LINK.txt in this project folder and click the link,",
      "  or copy the URL below into your browser:",
      "",
      "  " + url,
      "",
      "  (No email was sent — no email service is configured. This is normal",
      "   for local use. The link works once and expires in 24 hours.)",
      line,
      "",
    ].join("\n"),
  );

  try {
    const path = resolve(process.cwd(), "SIGN-IN-LINK.txt");
    await writeFile(
      path,
      `Sign-in link for: ${email}
Generated: ${new Date().toLocaleString()}

Click this link, or copy the whole thing into your browser:

${url}

Notes
-----
- It works once. Request another from the sign-in page if you need one.
- It expires 24 hours after it was created.
- No email was sent: this project has no email service configured, which is
  the intended setup for local use. Add RESEND_API_KEY to .env.local to send
  real email instead.
`,
      "utf8",
    );
  } catch (err) {
    console.warn("  (could not write SIGN-IN-LINK.txt:", String(err), ")");
  }
}
