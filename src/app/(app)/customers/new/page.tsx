import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/guard";
import { canCreateCustomers } from "@/lib/authz";
import { PageHeader, LinkButton } from "@/components/ui";
import { NewCustomerForm } from "./new-customer-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  const actor = await requireStaff();
  if (!canCreateCustomers(actor)) redirect("/customers");

  return (
    <>
      <PageHeader
        title="Add customer"
        breadcrumb={
          <LinkButton href="/customers" variant="ghost" size="sm" className="-ml-2.5">
            ← Customers
          </LinkButton>
        }
      />
      <NewCustomerForm />
    </>
  );
}
