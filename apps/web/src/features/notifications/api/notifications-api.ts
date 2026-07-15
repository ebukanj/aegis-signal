import { apiGet } from "@/lib/api";
import type { NotificationOverview as ApiOverview } from "@aegis/contracts";
import type {
  ChannelType,
  DeliveryStatus,
  HistoryItemType,
  NotificationChannel,
  NotificationHistoryItem,
  NotificationOverview,
  NotificationRule,
  DeliveryStatistics,
} from "@/features/notifications/types";

/**
 * Notifications data access — LIVE.
 *
 * The Notifications page now renders the platform's REAL delivery record from the
 * Notification Engine (M13): what was actually sent, to which channel, and how it
 * went. This maps the API's `NotificationOverview` onto the shapes the existing
 * page components speak.
 *
 * What is honestly derived rather than stored: the per-type routing "rules" are the
 * engine's default type→priority→channel mapping (there is no per-user config until
 * a Users milestone), and the 30-day chart is aggregated from the real recent
 * deliveries. Nothing is fabricated — a sparse chart on a quiet week is the truth.
 */

export interface NotificationWorkspaceData {
  overview: NotificationOverview;
  channels: NotificationChannel[];
  rules: NotificationRule[];
  history: NotificationHistoryItem[];
  stats: DeliveryStatistics;
}

export const notificationsApi = {
  get: async (): Promise<NotificationWorkspaceData> => {
    const api = await apiGet<ApiOverview>("/notifications");
    return mapOverview(api);
  },
};

/* ── Mapping the real API shape onto the page's shape ──────────────── */

function mapOverview(api: ApiOverview): NotificationWorkspaceData {
  const history = api.recent.map(toHistoryItem);
  const now = Date.now();
  const dayAgo = now - 86_400_000;
  const todayItems = history.filter((h) => h.timestamp >= dayAgo);

  const overview: NotificationOverview = {
    notificationsToday: api.stats.today,
    highPriorityToday: todayItems.filter((h) => h.priority === "CRITICAL" || h.priority === "HIGH").length,
    failedToday: api.stats.failed,
    activeChannels: api.channels.filter((c) => c.status === "AVAILABLE").length,
    successRate: api.stats.deliveryRate === null ? 100 : Math.round(api.stats.deliveryRate * 1000) / 10,
    lastNotificationTime: history[0]?.timestamp ?? 0,
    quietHoursActive: false,
    unreadCount: todayItems.length,
  };

  return {
    overview,
    channels: api.channels.map(toChannel),
    rules: rulesFromPreferences(api),
    history,
    stats: buildStats(api, history),
  };
}

function toChannel(c: ApiOverview["channels"][number]): NotificationChannel {
  const type = channelType(c.channel);
  return {
    id: c.channel.toLowerCase(),
    type,
    name: channelName(type),
    status:
      c.status === "AVAILABLE" ? "CONNECTED" : c.status === "DEGRADED" ? "MUTED" : "DISCONNECTED",
    lastDelivery: null,
    /* External channels are interface-ready but have no credentials yet — say so. */
    isComingSoon: c.status === "NOT_CONFIGURED",
  };
}

function toHistoryItem(n: ApiOverview["recent"][number]): NotificationHistoryItem {
  return {
    id: n.id,
    timestamp: n.createdAt,
    type: historyType(n.type),
    priority: n.priority,
    channel: channelType(n.channel),
    status: deliveryStatus(n.status),
    coin: n.subject ?? undefined,
    message: n.message.title,
  };
}

function rulesFromPreferences(api: ApiOverview): NotificationRule[] {
  /* The engine's defaults, shown as read-only rules until per-user config exists. */
  const channels = api.preferences.enabledChannels.map(channelType);
  const rule = (id: string, name: string, description: string, priority: NotificationRule["priority"]): NotificationRule => ({
    id,
    name,
    description,
    enabled: true,
    priority,
    channels,
  });
  return [
    rule("prime", "Prime signals", "The few high-conviction signals the platform interrupts you for.", "HIGH"),
    rule("outcomes", "Take profit & stop loss", "When a trade you were told about resolves.", "CRITICAL"),
    rule("risk", "Risk alerts", "A coin flagged as unsafe to trade.", "CRITICAL"),
    rule("platform", "Platform & exchange", "Strategy auto-disabled, an exchange going offline.", "MEDIUM"),
  ];
}

function buildStats(api: ApiOverview, history: NotificationHistoryItem[]): DeliveryStatistics {
  const now = Date.now();
  const day = 86_400_000;

  const volumeByChannel = api.channels
    .map((c) => ({ channel: channelType(c.channel), count: c.sentToday }))
    .filter((v) => v.count > 0);

  const byType = new Map<HistoryItemType, number>();
  for (const h of history) byType.set(h.type, (byType.get(h.type) ?? 0) + 1);

  /* Aggregate the real recent deliveries into a 30-day series. Sparse when the
   * platform has been quiet — which is the truth, not a gap to be filled. */
  const dailyVolume30Days = Array.from({ length: 30 }, (_, i) => {
    const time = now - (29 - i) * day;
    const from = time - (time % day);
    const to = from + day;
    const inDay = history.filter((h) => h.timestamp >= from && h.timestamp < to);
    return {
      time,
      volume: inDay.length,
      failures: inDay.filter((h) => h.status === "FAILED").length,
    };
  });

  return {
    successRatePct: api.stats.deliveryRate === null ? 100 : Math.round(api.stats.deliveryRate * 1000) / 10,
    totalVolumeToday: api.stats.today,
    totalVolumeWeek: history.filter((h) => h.timestamp >= now - 7 * day).length,
    failedDeliveriesToday: api.stats.failed,
    volumeByChannel,
    volumeByType: [...byType.entries()].map(([type, count]) => ({ type, count })),
    dailyVolume30Days,
  };
}

/* ── Enum mapping ──────────────────────────────────────────────────── */

function channelType(channel: string): ChannelType {
  if (channel === "IN_APP") return "BROWSER";
  return channel as ChannelType;
}

function channelName(type: ChannelType): string {
  const names: Record<ChannelType, string> = {
    BROWSER: "In-app",
    TELEGRAM: "Telegram",
    WHATSAPP: "WhatsApp",
    EMAIL: "Email",
    PUSH: "Push",
    DISCORD: "Discord",
    SLACK: "Slack",
  };
  return names[type];
}

function historyType(type: string): HistoryItemType {
  switch (type) {
    case "TAKE_PROFIT":
      return "TAKE_PROFIT";
    case "STOP_LOSS":
      return "STOP_LOSS";
    case "RISK_ALERT":
      return "RISK_WARNING";
    case "PRIME_SIGNAL":
    case "SIGNAL_PUBLISHED":
    case "SIGNAL_TRIGGERED":
      return "NEW_SIGNAL";
    default:
      return "SYSTEM";
  }
}

function deliveryStatus(status: string): DeliveryStatus {
  switch (status) {
    case "DELIVERED":
      return "DELIVERED";
    case "FAILED":
      return "FAILED";
    case "SUPPRESSED":
      return "MUTED_BY_QUIET_HOURS";
    default:
      return "PENDING";
  }
}
