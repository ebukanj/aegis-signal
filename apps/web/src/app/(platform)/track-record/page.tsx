import type { Metadata } from "next";
import { TrackRecordPage } from "@/features/track-record/components/track-record-page";

export const metadata: Metadata = {
  title: "Track Record",
  description: "Have these signals actually made money?",
};

export default function Page() {
  return <TrackRecordPage />;
}
