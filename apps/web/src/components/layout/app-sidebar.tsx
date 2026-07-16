"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Brand } from "@/components/layout/brand";
import { UserMenu } from "@/components/layout/user-menu";
import { navigation } from "@/config/navigation";
import { useAuthStore } from "@/features/auth/stores/auth-store";

/**
 * Primary application sidebar.
 * Collapses to an icon rail on desktop; renders as a sheet on mobile
 * (both behaviors provided by the shadcn Sidebar primitive).
 *
 * RBAC: the Administration entry renders only for ADMIN/SUPER_ADMIN. The server
 * enforces the real boundary — hiding the link just keeps the UI honest.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";

  const visibleNavigation = navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.href !== "/admin" || isAdmin),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3 group-data-[collapsible=icon]:px-2">
        <Link href="/signals" aria-label="Aegis Signal — Signals">
          <Brand className="group-data-[collapsible=icon]:hidden" />
          <Brand markOnly className="hidden group-data-[collapsible=icon]:flex" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {visibleNavigation.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
