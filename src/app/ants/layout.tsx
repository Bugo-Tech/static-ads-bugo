/**
 * Bugo Ants layout — wraps every route under /ants/* in AntsWorkflowProvider.
 * Isolated from main Bugo's WorkflowProvider and from PetTagWorkflowProvider.
 */

import { AntsWorkflowProvider } from "@/context/AntsWorkflowContext";

export default function AntsLayout({ children }: { children: React.ReactNode }) {
  return <AntsWorkflowProvider>{children}</AntsWorkflowProvider>;
}
