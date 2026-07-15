"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotificationStore } from "../stores/notification-store";
import type { NotificationTab } from "../stores/notification-store";
import { notificationsApi } from "../api/notifications-api";
import { onNotification } from "@/lib/notifications-socket";
import { NotificationHeader } from "./notification-header";
import { OverviewCards } from "./overview-cards";
import { ChannelManagement } from "./channel-management";
import { NotificationRules } from "./notification-rules";
import { QuietHours } from "./quiet-hours";
import { NotificationPreview } from "./notification-preview";
import { NotificationHistory } from "./notification-history";
import { DeliveryStatisticsCharts } from "./delivery-statistics";
import { NotificationTemplates } from "./notification-templates";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function NotificationWorkspace() {
  const { activeTab, setActiveTab } = useNotificationStore();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["notifications", "overview"],
    queryFn: () => notificationsApi.get(),
    refetchInterval: 60_000,
  });

  /* Live: when a notification is delivered, the socket nudges and the history
   * refetches — the page updates without a refresh, like the signals feed. */
  useEffect(() => {
    return onNotification(() => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", "overview"] });
    });
  }, [queryClient]);

  if (isPending || !data) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-14 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-20">
      <NotificationHeader />
      <OverviewCards overview={data.overview} />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NotificationTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        {/* SETTINGS TAB */}
        <TabsContent value="settings" className="space-y-8 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <ChannelManagement channels={data.channels} />

          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-8">
              <NotificationRules rules={data.rules} />
              <QuietHours />
            </div>
            <div>
              <div className="sticky top-6">
                <NotificationPreview />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <NotificationHistory history={data.history} />
        </TabsContent>

        {/* ANALYTICS TAB */}
        <TabsContent value="analytics" className="space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <DeliveryStatisticsCharts stats={data.stats} />
        </TabsContent>

        {/* TEMPLATES TAB */}
        <TabsContent value="templates" className="space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <NotificationTemplates />
        </TabsContent>
      </Tabs>
    </div>
  );
}
