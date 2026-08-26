import type { Role } from "@/db/schema";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      customerAccountId: string | null;
      isActive: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
    customerAccountId?: string | null;
    isActive?: boolean;
  }
}
