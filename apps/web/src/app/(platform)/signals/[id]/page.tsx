import type { Metadata } from "next";
import { SignalIntelligencePage } from "@/features/signals/components/signal-intelligence-page";

export const metadata: Metadata = { title: "Signal Intelligence" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SignalIntelligencePage signalId={id} />;
}
