import type { Metadata } from "next";
import { StrategiesPage } from "@/features/strategies/components/strategies-page";

export const metadata: Metadata = {
  title: "Strategies",
  description: "The rules that produce your signals.",
};

export default function Page() {
  return <StrategiesPage />;
}
