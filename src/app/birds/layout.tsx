/**
 * Bugo Birds layout — wraps every route under /birds/* in BirdsWorkflowProvider.
 * Isolated from main Bugo's WorkflowProvider and from PetTagWorkflowProvider.
 */

import { BirdsWorkflowProvider } from "@/context/BirdsWorkflowContext";

export default function BirdsLayout({ children }: { children: React.ReactNode }) {
  return <BirdsWorkflowProvider>{children}</BirdsWorkflowProvider>;
}
