import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts } from "@/db/schema";
import { deleteFile, putFile } from "@/lib/storage";
import type { LogoInput } from "@/lib/customer-logo-parse";

/**
 * Writes the customer mark. URL and upload are mutually exclusive.
 * Callers audit. `unchanged` is a no-op so create flows can always call this.
 */
export async function persistCustomerLogo(
  customerId: string,
  input: LogoInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.kind === "unchanged") return { ok: true };

  const existing = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.id, customerId),
    columns: { id: true, logoStorageKey: true },
  });
  if (!existing) return { ok: false, error: "Customer not found." };

  if (input.kind === "clear") {
    await db
      .update(customerAccounts)
      .set({ logoUrl: null, logoStorageKey: null, updatedAt: new Date() })
      .where(eq(customerAccounts.id, customerId));
    if (existing.logoStorageKey) await deleteFile(existing.logoStorageKey);
    return { ok: true };
  }

  if (input.kind === "url") {
    await db
      .update(customerAccounts)
      .set({ logoUrl: input.url, logoStorageKey: null, updatedAt: new Date() })
      .where(eq(customerAccounts.id, customerId));
    if (existing.logoStorageKey) await deleteFile(existing.logoStorageKey);
    return { ok: true };
  }

  let key: string;
  try {
    key = await putFile(input.name, input.bytes);
  } catch (err) {
    console.error("persistCustomerLogo upload failed", err);
    return { ok: false, error: "Could not store that logo. Please try again." };
  }

  try {
    await db
      .update(customerAccounts)
      .set({ logoUrl: null, logoStorageKey: key, updatedAt: new Date() })
      .where(eq(customerAccounts.id, customerId));
  } catch (err) {
    console.error("persistCustomerLogo update failed", err);
    await deleteFile(key);
    return { ok: false, error: "Could not save that logo. Please try again." };
  }

  if (existing.logoStorageKey && existing.logoStorageKey !== key) {
    await deleteFile(existing.logoStorageKey);
  }
  return { ok: true };
}
