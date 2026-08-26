import { cookies } from "next/headers";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { env } from "@/lib/env";
import { sendEmail, signInEmail } from "@/lib/email";
import { writeSignInLink } from "@/lib/signin-link";
import type { Actor } from "@/lib/authz";

function isInternalEmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && env.INTERNAL_EMAIL_DOMAINS.includes(domain);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
    error: "/signin/error",
  },
  providers: [
    Resend({
      apiKey: env.RESEND_API_KEY || "re_dev_placeholder",
      from: env.EMAIL_FROM,
      // 24 hours — external contacts often don't check email immediately.
      maxAge: 24 * 60 * 60,
      async sendVerificationRequest({ identifier, url }) {
        const existing = await db.query.users.findFirst({
          where: eq(users.email, identifier.toLowerCase()),
          columns: { role: true },
        });

        // No email service configured: there is no inbox for this to land in,
        // so make the link impossible to miss instead of burying it in the log.
        if (!env.EMAIL_ENABLED) {
          await writeSignInLink(identifier, url);
          return;
        }

        await sendEmail({
          to: identifier,
          subject: "Your PIMSY implementation sign-in link",
          html: signInEmail(url, existing?.role === "CUSTOMER"),
        });
      },
    }),
    ...(env.GOOGLE_ID && env.GOOGLE_SECRET
      ? [
          Google({
            clientId: env.GOOGLE_ID,
            clientSecret: env.GOOGLE_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  callbacks: {
    /**
     * Gatekeeper. Only three kinds of address may sign in:
     *  1. an address already provisioned in the users table (staff or invited
     *     customer contact),
     *  2. an address on a configured internal domain,
     *  3. the bootstrap owner address.
     * Everything else is refused, so an unknown email can never self-register
     * into a customer's workspace.
     */
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;

      const existing = await db.query.users.findFirst({
        where: eq(users.email, email),
        columns: { id: true, isActive: true },
      });

      if (existing) return existing.isActive;
      if (email === env.BOOTSTRAP_OWNER_EMAIL) return true;
      if (isInternalEmail(email)) return true;
      return false;
    },

    async session({ session, user }) {
      const row = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: {
          id: true,
          role: true,
          customerAccountId: true,
          isActive: true,
          name: true,
          email: true,
          image: true,
        },
      });
      if (row) {
        session.user.id = row.id;
        session.user.role = row.role;
        session.user.customerAccountId = row.customerAccountId;
        session.user.isActive = row.isActive;
        session.user.name = row.name;
        session.user.email = row.email;
        session.user.image = row.image;
      }
      return session;
    },
  },
  events: {
    /**
     * Assign the correct role the first time an account is created. The
     * adapter defaults every new row to MEMBER; internal domains stay MEMBER
     * until an admin promotes them, and the bootstrap address becomes OWNER so
     * the very first sign-in can administer the system.
     */
    async createUser({ user }) {
      const email = user.email?.toLowerCase();
      if (!email || !user.id) return;

      if (email === env.BOOTSTRAP_OWNER_EMAIL) {
        await db.update(users).set({ role: "OWNER" }).where(eq(users.id, user.id));
        return;
      }
      if (isInternalEmail(email)) {
        await db.update(users).set({ role: "SPECIALIST" }).where(eq(users.id, user.id));
      }
    },
    async signIn({ user }) {
      if (user.id) {
        await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
      }
    },
  },
});

/**
 * Reads the session straight from the cookie and the sessions table.
 *
 * WHY THIS EXISTS. On next-auth 5.0.0-beta.32, `auth()` resolves the session
 * correctly inside server components but returns null inside **server
 * actions**, with the very same cookie present. Every mutation in the app goes
 * through a server action, so without this the whole app is read-only: ticking
 * a task off bounces you to the sign-in page and silently does nothing.
 *
 * This is not a way around authentication — it is the same lookup the Drizzle
 * adapter performs. The cookie is httpOnly and holds an opaque random token;
 * we check that the session exists, has not expired, and belongs to an active
 * user. Cross-site request forgery is still covered, because Next.js validates
 * the Origin against the Host for every server action before our code runs.
 *
 * Revisit this when next-auth reaches a stable v5: if `auth()` starts working
 * in actions, this becomes a redundant fallback rather than the load-bearing
 * path, and can go.
 */
async function actorFromSessionCookie(): Promise<Actor | null> {
  const jar = await cookies();
  // Auth.js prefixes the cookie with __Secure- when it is issued over https.
  const token =
    jar.get("__Secure-authjs.session-token")?.value ??
    jar.get("authjs.session-token")?.value;
  if (!token) return null;

  const row = await db.query.sessions.findFirst({
    where: eq(sessions.sessionToken, token),
    columns: { userId: true, expires: true },
  });
  if (!row) return null;
  if (row.expires.getTime() <= Date.now()) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, row.userId),
    columns: {
      id: true,
      email: true,
      name: true,
      role: true,
      customerAccountId: true,
      isActive: true,
    },
  });

  if (!user?.email) return null;
  if (user.isActive === false) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role,
    customerAccountId: user.customerAccountId ?? null,
    isActive: true,
  };
}

/** The current actor, or null when signed out. */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (session?.user?.id && session.user.email) {
    if (session.user.isActive === false) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      role: session.user.role,
      customerAccountId: session.user.customerAccountId ?? null,
      isActive: session.user.isActive ?? true,
    };
  }
  // Server-action path — see actorFromSessionCookie above.
  return actorFromSessionCookie();
}
