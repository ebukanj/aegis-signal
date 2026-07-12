import { createSeededRandom, pick, randInt } from "@/lib/seeded-random";
import type { 
  NotificationChannel, 
  NotificationRule, 
  NotificationHistoryItem, 
  DeliveryStatistics, 
  NotificationOverview,
  HistoryItemType,
  ChannelType,
  AlertPriority,
  DeliveryStatus
} from "../types";

export function generateMockNotifications(): {
  channels: NotificationChannel[];
  rules: NotificationRule[];
  history: NotificationHistoryItem[];
  stats: DeliveryStatistics;
  overview: NotificationOverview;
} {
  const rand = createSeededRandom(1234);
  const randomFloat = (min: number, max: number) => min + rand() * (max - min);
  const randomChoice = <T>(items: T[] | readonly T[]) => pick(rand, items);

  const now = Math.floor(Date.now() / 1000);
  const oneDay = 86400;

  // 1. Channels
  const channels: NotificationChannel[] = [
    { id: "ch_tg", type: "TELEGRAM", name: "Telegram Bot", status: "CONNECTED", lastDelivery: now - 3600 },
    { id: "ch_wa", type: "WHATSAPP", name: "WhatsApp Business", status: "DISCONNECTED", lastDelivery: null },
    { id: "ch_em", type: "EMAIL", name: "Primary Email", status: "CONNECTED", lastDelivery: now - 86400 },
    { id: "ch_br", type: "BROWSER", name: "Browser Push", status: "MUTED", lastDelivery: now - 120000 },
    { id: "ch_dc", type: "DISCORD", name: "Discord Webhook", status: "DISCONNECTED", lastDelivery: null, isComingSoon: true },
    { id: "ch_sl", type: "SLACK", name: "Slack Integration", status: "DISCONNECTED", lastDelivery: null, isComingSoon: true },
    { id: "ch_ps", type: "PUSH", name: "Mobile Push", status: "DISCONNECTED", lastDelivery: null, isComingSoon: true },
  ];

  // 2. Rules
  const rules: NotificationRule[] = [
    { id: "r_new_sig", name: "New Signal", description: "When a new trading signal is generated", enabled: true, priority: "HIGH", channels: ["TELEGRAM", "BROWSER"] },
    { id: "r_sig_exp", name: "Signal Expired", description: "When an unfilled signal expires", enabled: false, priority: "LOW", channels: ["BROWSER"] },
    { id: "r_tp", name: "Take Profit Hit", description: "When a position hits a take profit target", enabled: true, priority: "CRITICAL", channels: ["TELEGRAM", "EMAIL"] },
    { id: "r_sl", name: "Stop Loss Hit", description: "When a position hits a stop loss", enabled: true, priority: "CRITICAL", channels: ["TELEGRAM", "EMAIL"] },
    { id: "r_risk", name: "Risk Warning", description: "When portfolio risk exceeds threshold", enabled: true, priority: "HIGH", channels: ["TELEGRAM"] },
    { id: "r_regime", name: "Market Regime Change", description: "When macro market regime shifts", enabled: true, priority: "MEDIUM", channels: ["EMAIL"] },
  ];

  // 3. History
  const history: NotificationHistoryItem[] = [];
  const coins = ["BTC", "ETH", "SOL", "AVAX", "LINK"];
  const strategies = ["Momentum Ignition", "Mean Reversion", "Volatility Breakout"];
  
  const itemTypes: HistoryItemType[] = ["NEW_SIGNAL", "TAKE_PROFIT", "STOP_LOSS", "RISK_WARNING", "SYSTEM"];
  const priorities: AlertPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const activeChannels: ChannelType[] = ["TELEGRAM", "EMAIL", "BROWSER"];
  
  for (let i = 0; i < 100; i++) {
    const isToday = i < 15;
    const timestamp = isToday 
      ? now - randInt(rand, 60, 86400) 
      : now - randInt(rand, 86400, 30 * 86400);

    const type = randomChoice(itemTypes);
    const channel = randomChoice(activeChannels);
    let status: DeliveryStatus = "DELIVERED";
    
    const failRoll = randomFloat(0, 100);
    if (failRoll < 2) status = "FAILED";
    else if (failRoll < 5) status = "MUTED_BY_QUIET_HOURS";
    
    let priority: AlertPriority = "LOW";
    if (type === "TAKE_PROFIT" || type === "STOP_LOSS") priority = "CRITICAL";
    else if (type === "NEW_SIGNAL" || type === "RISK_WARNING") priority = "HIGH";
    else priority = randomChoice(priorities);

    history.push({
      id: `evt_${100 - i}`,
      timestamp,
      type,
      priority,
      channel,
      status,
      coin: type !== "SYSTEM" && type !== "RISK_WARNING" ? randomChoice(coins) : undefined,
      strategy: type !== "SYSTEM" && type !== "RISK_WARNING" ? randomChoice(strategies) : undefined,
      message: type === "NEW_SIGNAL" ? "New LONG setup identified" : 
               type === "TAKE_PROFIT" ? "Take Profit 1 Reached (+2.4%)" :
               type === "STOP_LOSS" ? "Stop Loss Triggered (-1.2%)" :
               type === "RISK_WARNING" ? "Portfolio exposure exceeds 5%" :
               "Daily summary generated",
    });
  }
  history.sort((a, b) => b.timestamp - a.timestamp); // Descending

  // 4. Stats
  const dailyVolume30Days = [];
  for (let i = 29; i >= 0; i--) {
    const time = now - i * oneDay;
    const volume = randInt(rand, 5, 25);
    const failures = randomFloat(0, 100) > 90 ? randInt(rand, 1, 3) : 0;
    dailyVolume30Days.push({ time, volume, failures });
  }

  const stats: DeliveryStatistics = {
    successRatePct: 98.4,
    totalVolumeToday: 15,
    totalVolumeWeek: 124,
    failedDeliveriesToday: 0,
    volumeByChannel: [
      { channel: "TELEGRAM", count: 85 },
      { channel: "EMAIL", count: 24 },
      { channel: "BROWSER", count: 15 },
    ],
    volumeByType: [
      { type: "NEW_SIGNAL", count: 60 },
      { type: "TAKE_PROFIT", count: 30 },
      { type: "STOP_LOSS", count: 15 },
      { type: "RISK_WARNING", count: 4 },
      { type: "SYSTEM", count: 15 },
    ],
    dailyVolume30Days,
  };

  // 5. Overview
  const overview: NotificationOverview = {
    notificationsToday: 15,
    highPriorityToday: 4,
    failedToday: 0,
    activeChannels: 2,
    successRate: 98.4,
    lastNotificationTime: now - 1800,
    quietHoursActive: false,
    unreadCount: 3,
  };

  return { channels, rules, history, stats, overview };
}

export const mockNotificationsData = generateMockNotifications();
