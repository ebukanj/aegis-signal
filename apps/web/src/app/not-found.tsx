import { Compass } from "lucide-react";
import { StatusPage } from "@/components/shared/status-page";

export default function NotFound() {
  return (
    <StatusPage
      icon={Compass}
      code="404"
      title="Page not found"
      description="The page you are looking for does not exist or has moved."
    />
  );
}
