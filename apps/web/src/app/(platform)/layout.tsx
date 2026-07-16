"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { SkipToContent } from "@/components/layout/skip-to-content";
import { Topbar } from "@/components/layout/topbar";
import { useUiStore } from "@/stores/ui-store";
import { onNotification } from "@/lib/notifications-socket";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { ScrollToTop } from "@/components/layout/scroll-to-top";

/**
 * Authenticated platform shell: sidebar + topbar + workspace content.
 * Sidebar collapse state lives in the UI store (single source of truth)
 * and is persisted across sessions.
 */
export default function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);

  /* A live toast on any delivery, anywhere in the app — the Notification Engine's
   * in-app channel reaching the trader the instant an event fires. */
  useEffect(() => {
    return onNotification((n) => {
      toast(n.title, { description: n.body || undefined });
    });
  }, []);

  return (
    <AuthGate>
      <SidebarProvider
        open={!sidebarCollapsed}
        onOpenChange={(open) => setSidebarCollapsed(!open)}
      >
        <SkipToContent />
        <ScrollToTop />
        <AppSidebar />
        {/* min-w-0 lets inner tables scroll in place instead of widening the page */}
        <SidebarInset className="min-w-0 overflow-x-clip">
          <OfflineBanner />
          <Topbar />
          <main
            id="main-content"
            tabIndex={-1}
            className="min-w-0 flex-1 p-4 md:p-6"
          >
            {/* Keyed on the route so every page arrives with a soft fade-up —
                perceived smoothness, at zero JS cost (CSS animation only). */}
            <div
              key={pathname}
              className="animate-in fade-in-25 slide-in-from-bottom-2 duration-300"
            >
              {children}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AuthGate>
  );
}
