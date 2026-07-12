"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPage } from "@/components/shared/status-page";

/**
 * Global error boundary. Rendering errors must never be silent
 * (Founding Principle 13 — Fail Safely).
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <StatusPage
      icon={AlertTriangle}
      code="Error"
      title="Something went wrong"
      description="An unexpected error occurred while rendering this page. The issue has been contained to this view."
      action={
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
