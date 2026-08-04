/**
 * Bugo Fly layout — wraps every route under /fly/* in FlyWorkflowProvider.
 * Isolated from main Bugo's WorkflowProvider and from PetTagWorkflowProvider.
 */

import { FlyWorkflowProvider } from "@/context/FlyWorkflowContext";

export default function FlyLayout({ children }: { children: React.ReactNode }) {
  return <FlyWorkflowProvider>{children}</FlyWorkflowProvider>;
}
