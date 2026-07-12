import type { Metadata } from "next";
import { AdminWorkspace } from "@/features/admin/components/admin-workspace";

export const metadata: Metadata = {
  title: "Administration Center",
  description: "Enterprise operations and infrastructure management console.",
};

export default function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <div className="border-b pb-6 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Administration Center</h1>
        <p className="text-muted-foreground mt-2">Platform operations, infrastructure health, and user management.</p>
      </div>
      <AdminWorkspace />
    </div>
  );
}
