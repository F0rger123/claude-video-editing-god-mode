import { PageHeader } from "@/components/ui";
import { ClientForm } from "../client-form";
import { createClientWorkspace } from "../actions";

export const metadata = { title: "Add client" };

export default function NewClientPage() {
  return (
    <div>
      <PageHeader title="Add client" back="/clients" meta="Everything here can be changed later. Channels and portal invites come after saving." />
      <ClientForm action={createClientWorkspace} submit="Create client" wizard />
    </div>
  );
}
