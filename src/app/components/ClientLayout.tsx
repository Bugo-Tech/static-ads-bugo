"use client";

import { ReactNode } from "react";
import { WorkflowProvider } from "@/context/WorkflowContext";
import { AuthProvider } from "@/context/AuthContext";
import FloatingProgress from "./FloatingProgress";

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WorkflowProvider>
        {children}
        <FloatingProgress />
      </WorkflowProvider>
    </AuthProvider>
  );
}
