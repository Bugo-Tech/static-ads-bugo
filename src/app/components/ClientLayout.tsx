"use client";

import { ReactNode } from "react";
import { WorkflowProvider } from "@/context/WorkflowContext";
import FloatingProgress from "./FloatingProgress";

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <WorkflowProvider>
      {children}
      <FloatingProgress />
    </WorkflowProvider>
  );
}
