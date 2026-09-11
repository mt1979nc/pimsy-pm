import type { Role } from "@/db/schema";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      customerAccountId: string | null;
      isActive: boolean;
      mustChangePassword?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
    customerAccountId?: string | null;
    isActive?: boolean;
    mustChangePassword?: boolean;
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role?: Role;
    customerAccountId?: string | null;
    isActive?: boolean;
    mustChangePassword?: boolean;
  }
}
