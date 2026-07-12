"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useUiStore } from "@/stores/ui-store";

/**
 * Authenticated platform shell: sidebar + topbar + workspace content.
 * Sidebar collapse state lives in the UI store (single source of truth)
 * and is persisted across sessions.
 */
export default function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);

  return (
    <SidebarProvider
      open={!sidebarCollapsed}
      onOpenChange={(open) => setSidebarCollapsed(!open)}
    >
      <AppSidebar />
      {/* min-w-0 lets inner tables scroll in place instead of widening the page */}
      <SidebarInset className="min-w-0 overflow-x-clip">
        <Topbar />
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
