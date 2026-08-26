import { signOut } from "@/auth";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/signin" });
      }}
    >
      <button
        type="submit"
        className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        Sign out
      </button>
    </form>
  );
}
