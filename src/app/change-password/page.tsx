import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import { PasswordForm } from "@/components/password-form";
import { Card, CardHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const actor = await requireUser();
  const me = await db.query.users.findFirst({ where: eq(users.id, actor.id) });
  if (!me) redirect("/signin");

  // Already cleared — send them into the app.
  if (!me.mustChangePassword) {
    redirect(me.role === "CUSTOMER" ? "/portal" : "/dashboard");
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-bg px-4 py-16">
      <div className="w-full max-w-[480px] space-y-4">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/pimsy-icon-color.png" alt="" className="size-8" />
          <div>
            <div className="text-[15px] font-semibold text-ink">Change your password</div>
            <div className="text-[12.5px] text-ink-3">{me.email}</div>
          </div>
        </div>
        <Card>
          <CardHeader
            title="Temporary password"
            subtitle="You signed in with a temporary password. Choose a new one before continuing."
          />
          <PasswordForm hasPassword={!!me.passwordHash} forced />
        </Card>
      </div>
    </div>
  );
}
