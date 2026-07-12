import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { StatusPage } from "@/components/shared/status-page";

export const metadata: Metadata = { title: "Maintenance" };

export default function MaintenancePage() {
  return (
    <StatusPage
      icon={Wrench}
      code="503"
      title="Scheduled maintenance"
      description="Aegis Signal is briefly offline for planned maintenance. Market data collection resumes automatically when we're back."
      action={<span className="label-caps">Check back shortly</span>}
    />
  );
}
