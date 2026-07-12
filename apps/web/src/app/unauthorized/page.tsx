import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPage } from "@/components/shared/status-page";

export const metadata: Metadata = { title: "Unauthorized" };

export default function UnauthorizedPage() {
  return (
    <StatusPage
      icon={Lock}
      code="403"
      title="Access restricted"
      description="Your account does not have permission to view this area. Contact an administrator if you believe this is a mistake."
      action={
        <Button asChild variant="outline">
          <Link href="/login">Sign in with a different account</Link>
        </Button>
      }
    />
  );
}
