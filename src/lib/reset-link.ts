import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Local-dev delivery for password-reset links, mirroring
 * src/lib/signin-link.ts's writeSignInLink. With no email service configured
 * there's no inbox for the link to land in, so it goes to a file instead.
 */
export async function writePasswordResetLink(email: string, url: string, isNew: boolean) {
  const line = "═".repeat(74);
  const verb = isNew ? "SET A PASSWORD" : "RESET PASSWORD";
  console.log(
    [
      "",
      line,
      `  ${verb} link for ${email}`,
      "",
      "  Open PASSWORD-RESET-LINK.txt in this project folder and click the link,",
      "  or copy the URL below into your browser:",
      "",
      "  " + url,
      "",
      "  (No email was sent — no email service is configured. This is normal",
      "   for local use. The link works once and expires in 1 hour.)",
      line,
      "",
    ].join("\n"),
  );

  try {
    const path = resolve(process.cwd(), "PASSWORD-RESET-LINK.txt");
    await writeFile(
      path,
      `${isNew ? "Set-password" : "Password-reset"} link for: ${email}
Generated: ${new Date().toLocaleString()}

Click this link, or copy the whole thing into your browser:

${url}

Notes
-----
- It works once. Request another from the "Forgot password?" link if you need one.
- It expires 1 hour after it was created.
- No email was sent: this project has no email service configured, which is
  the intended setup for local use. Add RESEND_API_KEY to .env.local to send
  real email instead.
`,
      "utf8",
    );
  } catch (err) {
    console.warn("  (could not write PASSWORD-RESET-LINK.txt:", String(err), ")");
  }
}
