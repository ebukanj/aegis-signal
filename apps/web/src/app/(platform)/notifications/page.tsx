import type { Metadata } from "next";
import { NotificationWorkspace } from "@/features/notifications/components/notification-workspace";

export const metadata: Metadata = {
  title: "Notification Center",
  description: "Centralized command hub for managing trading intelligence delivery.",
};

export default function NotificationsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <NotificationWorkspace />
    </div>
  );
}
