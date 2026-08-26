import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { env } from "@/lib/env";

// Matches auth.ts's `session: { strategy: "database", maxAge: ... }`.
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Creates a database session row identical in shape to what Auth.js's
 * DrizzleAdapter creates for a magic-link or Google sign-in, and sets the
 * same cookie Auth.js reads.
 *
 * Password sign-in (src/actions/auth.ts) doesn't go through NextAuth's
 * provider pipeline at all — Auth.js's Credentials provider only supports
 * JWT sessions, and this app's session model (including the
 * actorFromSessionCookie fallback in src/auth.ts, load-bearing for every
 * server action) is built entirely around database sessions. Rather than
 * fork the session model for one login method, password sign-in creates the
 * exact same kind of session row directly. The result is indistinguishable
 * from any other session everywhere else in the app.
 */
export async function createDatabaseSession(userId: string): Promise<void> {
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await db.insert(sessions).values({ sessionToken, userId, expires });

  const jar = await cookies();
  const secure = env.IS_PROD;
  // Auth.js prefixes the cookie with __Secure- only when issued over https.
  jar.set(secure ? "__Secure-authjs.session-token" : "authjs.session-token", sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires,
  });
}
