/**
 * Bugo Guard layout — wraps every route under /guard/* in GuardWorkflowProvider.
 * Isolated from main Bugo's WorkflowProvider and from PetTagWorkflowProvider.
 */

import { GuardWorkflowProvider } from "@/context/GuardWorkflowContext";

export default function GuardLayout({ children }: { children: React.ReactNode }) {
  return <GuardWorkflowProvider>{children}</GuardWorkflowProvider>;
}
