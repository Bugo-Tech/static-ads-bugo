/**
 * Pet Tag layout — wraps every route under /pet-tag/* in PetTagWorkflowProvider.
 * The main flow's WorkflowProvider (in src/app/components/ClientLayout.tsx) is
 * applied at the root level — this layout adds the pet-tag-specific provider
 * ON TOP of it for the /pet-tag subtree. The two providers are independent,
 * so cross-tab state never leaks.
 */

import { PetTagWorkflowProvider } from "@/context/PetTagWorkflowContext";

export default function PetTagLayout({ children }: { children: React.ReactNode }) {
  return <PetTagWorkflowProvider>{children}</PetTagWorkflowProvider>;
}
