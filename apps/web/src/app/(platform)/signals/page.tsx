import type { Metadata } from "next";
import { Zap } from "lucide-react";
import { WorkspacePlaceholder } from "@/components/layout/workspace-placeholder";

export const metadata: Metadata = { title: "Signals" };

export default function SignalsPage() {
  return (
    <WorkspacePlaceholder
      icon={Zap}
      title="Signals"
      question="Why should I care?"
      phase="Phase 4"
    />
  );
}
