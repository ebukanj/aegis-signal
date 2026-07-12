import type { MarketRegime, SignalDirection, Timeframe } from "@/types/domain";

export type ChannelType = "TELEGRAM" | "WHATSAPP" | "EMAIL" | "BROWSER" | "DISCORD" | "SLACK" | "PUSH";
export type ChannelStatus = "CONNECTED" | "DISCONNECTED" | "MUTED";
export type AlertPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface NotificationChannel {
  id: string;
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  lastDelivery: number | null; // Unix timestamp
  isComingSoon?: boolean;
}

export interface NotificationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: AlertPriority;
  channels: ChannelType[];
}

export interface SignalFilters {
  strategies: string[];
  exchanges: string[];
  coins: string[];
  marketRegimes: MarketRegime[];
  directions: SignalDirection[];
  minConfidence: number; // 0-100
  riskLevels: string[];
  timeframes: Timeframe[];
}

export interface QuietHours {
  enabled: boolean;
  startTime: string; // "22:00"
  endTime: string; // "06:00"
  timezone: string;
  weekendRules: "ALWAYS_QUIET" | "SAME_AS_WEEKDAYS" | "NEVER_QUIET";
  emergencyOverride: boolean; // Allow CRITICAL regardless of quiet hours
}

export type HistoryItemType = "NEW_SIGNAL" | "TAKE_PROFIT" | "STOP_LOSS" | "RISK_WARNING" | "SYSTEM";
export type DeliveryStatus = "DELIVERED" | "FAILED" | "PENDING" | "MUTED_BY_QUIET_HOURS";

export interface NotificationHistoryItem {
  id: string;
  timestamp: number; // Unix timestamp
  type: HistoryItemType;
  priority: AlertPriority;
  channel: ChannelType;
  status: DeliveryStatus;
  strategy?: string;
  coin?: string;
  message: string;
}

export interface DeliveryStatistics {
  successRatePct: number;
  totalVolumeToday: number;
  totalVolumeWeek: number;
  failedDeliveriesToday: number;
  volumeByChannel: { channel: ChannelType; count: number }[];
  volumeByType: { type: HistoryItemType; count: number }[];
  dailyVolume30Days: { time: number; volume: number; failures: number }[];
}

export interface NotificationOverview {
  notificationsToday: number;
  highPriorityToday: number;
  failedToday: number;
  activeChannels: number;
  successRate: number;
  lastNotificationTime: number;
  quietHoursActive: boolean;
  unreadCount: number;
}
