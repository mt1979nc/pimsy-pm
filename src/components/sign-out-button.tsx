import { signOut } from "@/auth";
import { cn } from "@/lib/cn";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/signin" });
      }}
    >
      <button
        type="submit"
        className={cn(
          "w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink",
          className,
        )}
      >
        Sign out
      </button>
    </form>
  );
}
