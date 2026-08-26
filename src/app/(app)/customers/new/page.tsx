import { requireStaff } from "@/lib/guard";
import { PageHeader, LinkButton } from "@/components/ui";
import { NewCustomerForm } from "./new-customer-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  await requireStaff();
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
