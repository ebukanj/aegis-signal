import type { Metadata } from "next";
import { ScannerPage } from "@/features/scanner/components/scanner-page";

export const metadata: Metadata = { title: "Market Scanner" };

export default function Page() {
  return <ScannerPage />;
}
