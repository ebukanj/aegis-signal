import type { Metadata } from "next";
import { SignalsWorkspace } from "@/features/signals/components/signals-workspace";

export const metadata: Metadata = {
  title: "Signals",
  description: "What should I trade today?",
};

export default function SignalsPage() {
  return <SignalsWorkspace />;
}
