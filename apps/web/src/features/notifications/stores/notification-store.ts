import { create } from "zustand";
import type { ChannelType } from "../types";

export type NotificationTab = "settings" | "history" | "templates" | "analytics";

interface NotificationState {
  activeTab: NotificationTab;
  setActiveTab: (tab: NotificationTab) => void;
  
  previewChannel: ChannelType;
  setPreviewChannel: (channel: ChannelType) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  activeTab: "settings",
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  previewChannel: "TELEGRAM",
  setPreviewChannel: (channel) => set({ previewChannel: channel }),
}));
