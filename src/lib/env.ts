/**
 * Environment access with clear failure messages.
 * Server-only — never import this from a client component.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get DIRECT_URL() {
    return optional("DIRECT_URL") || required("DATABASE_URL");
  },
  get AUTH_SECRET() {
    return required("AUTH_SECRET");
  },
  get RESEND_API_KEY() {
    return optional("RESEND_API_KEY");
  },
  get EMAIL_FROM() {
    return optional("EMAIL_FROM", "PIMSY Implementations <onboarding@resend.dev>");
  },
  get GOOGLE_ID() {
    return optional("AUTH_GOOGLE_ID");
  },
  get GOOGLE_SECRET() {
    return optional("AUTH_GOOGLE_SECRET");
  },
  get INTERNAL_EMAIL_DOMAINS(): string[] {
    return optional("INTERNAL_EMAIL_DOMAINS", "pimsyehr.com")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  },
  get BOOTSTRAP_OWNER_EMAIL() {
    return optional("BOOTSTRAP_OWNER_EMAIL").toLowerCase();
  },
  get APP_URL() {
    return (
      optional("AUTH_URL") ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
    );
  },
  get IS_PROD() {
    return process.env.NODE_ENV === "production";
  },
  /** Email sending is optional in dev; magic links get logged to the console. */
  get EMAIL_ENABLED() {
    return optional("RESEND_API_KEY").length > 0;
  },
  /**
   * Attachment storage. Local disk (./uploads) is the default and what local
   * dev and the demo environment use. Set AZURE_STORAGE_CONNECTION_STRING to
   * switch to Azure Blob Storage instead — needed on Azure App Service, whose
   * local filesystem isn't reliably persistent across restarts or scale-out.
   * See src/lib/storage.ts.
   */
  get AZURE_STORAGE_CONNECTION_STRING() {
    return optional("AZURE_STORAGE_CONNECTION_STRING");
  },
  get AZURE_STORAGE_CONTAINER() {
    return optional("AZURE_STORAGE_CONTAINER", "pimsy-uploads");
  },
  get STORAGE_BACKEND(): "local" | "azure-blob" {
    return optional("AZURE_STORAGE_CONNECTION_STRING").length > 0 ? "azure-blob" : "local";
  },
};
