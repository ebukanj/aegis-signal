import { createSeededRandom, pick, randInt } from "@/lib/seeded-random";
import type { 
  UserProfile, 
  AppearanceSettings, 
  TradingPreferences, 
  SecuritySettings, 
  ApiKey, 
  ConnectedAccount, 
  Integration, 
  PrivacySettings, 
  AccessibilitySettings, 
  AccountSettings 
} from "../types";

export function generateMockSettings() {
  const rand = createSeededRandom(4567);
  const now = Math.floor(Date.now() / 1000);

  const profile: UserProfile = {
    id: "usr_12345",
    fullName: "Alex Mercer",
    username: "amercer_quant",
    email: "alex.mercer@aegis-signal.io",
    phoneNumber: "+1 (555) 019-2834",
    country: "United States",
    timezone: "America/New_York",
    preferredCurrency: "USD",
    biography: "Quantitative researcher focusing on volatility breakout strategies.",
    role: "Pro Trader",
    memberSince: now - 31536000 * 2, // 2 years ago
  };

  const appearance: AppearanceSettings = {
    theme: "dark",
    accentColor: "blue",
    fontSize: "medium",
    compactMode: "default",
    sidebarCollapsed: false,
    animationsEnabled: true,
    reducedMotion: false,
    chartTheme: "modern",
    dashboardDensity: "comfortable",
  };

  const trading: TradingPreferences = {
    defaultExchange: "Binance",
    defaultTimeframe: "1H",
    defaultMarket: "BTC/USDT",
    defaultRiskPct: 2.5,
    preferredStrategy: "Breakout",
    defaultPositionSize: 10000,
    preferredMarketRegime: "Trending Volatile",
    autoRefresh: true,
    autoSaveLayout: true,
  };

  const security: SecuritySettings = {
    twoFactorEnabled: true,
    recoveryCodesGenerated: true,
    securityScore: 92,
    recentSessions: [
      { id: "ses_1", device: "MacBook Pro M2", browser: "Chrome 114", location: "New York, USA", ipAddress: "192.168.1.42", lastActive: now - 120, isCurrent: true },
      { id: "ses_2", device: "iPhone 14 Pro", browser: "Safari iOS", location: "New York, USA", ipAddress: "192.168.1.105", lastActive: now - 86400, isCurrent: false },
      { id: "ses_3", device: "Windows Desktop", browser: "Firefox 112", location: "London, UK", ipAddress: "82.14.23.11", lastActive: now - 604800, isCurrent: false },
    ],
  };

  const apiKeys: ApiKey[] = [
    { id: "apk_1", exchange: "Binance", name: "Main Trading Key", keyPrefix: "vm8xK9...", permissions: ["Read", "Trade"], createdAt: now - 5000000, lastUsed: now - 3600, status: "active" },
    { id: "apk_2", exchange: "Bybit", name: "Altcoin Automation", keyPrefix: "by72zA...", permissions: ["Read", "Trade", "Withdraw"], createdAt: now - 10000000, lastUsed: now - 86400, status: "active" },
    { id: "apk_3", exchange: "Kraken", name: "Read Only Audit", keyPrefix: "kr99pQ...", permissions: ["Read"], createdAt: now - 20000000, lastUsed: now - 15000000, status: "expired" },
  ];

  const connectedAccounts: ConnectedAccount[] = [
    { id: "ca_1", provider: "Google", status: "connected", lastActivity: now - 3600, accountIdentifier: "alex.mercer@gmail.com" },
    { id: "ca_2", provider: "GitHub", status: "connected", lastActivity: now - 86400, accountIdentifier: "amercer" },
    { id: "ca_3", provider: "Apple", status: "disconnected", lastActivity: null },
    { id: "ca_4", provider: "Discord", status: "connected", lastActivity: now - 7200, accountIdentifier: "mercer#1234" },
    { id: "ca_5", provider: "Telegram", status: "disconnected", lastActivity: null },
  ];

  const integrations: Integration[] = [
    { id: "int_1", service: "TradingView", status: "active", description: "Receive custom webhook alerts from TradingView." },
    { id: "int_2", service: "Telegram", status: "active", description: "Get instant trade notifications via Telegram bot." },
    { id: "int_3", service: "WhatsApp", status: "inactive", description: "Connect WhatsApp for critical alerts." },
    { id: "int_4", service: "Slack", status: "inactive", description: "Send team alerts to specific Slack channels." },
    { id: "int_5", service: "Discord", status: "active", description: "Route signals to Discord community servers." },
    { id: "int_6", service: "Webhook", status: "active", description: "Forward signals to custom endpoints." },
    { id: "int_7", service: "Google Sheets", status: "coming_soon", description: "Auto-export trade history to spreadsheets." },
  ];

  const privacy: PrivacySettings = {
    dataCollection: true,
    analyticsEnabled: true,
    cookiePreferences: "all",
  };

  const accessibility: AccessibilitySettings = {
    fontScaling: "medium",
    highContrast: false,
    keyboardNavigation: true,
    reducedMotion: false,
    colorBlindMode: "none",
    screenReaderOptimization: false,
  };

  const account: AccountSettings = {
    subscriptionPlan: "Aegis Pro",
    storageUsedBytes: 1024 * 1024 * 450, // 450MB
    storageTotalBytes: 1024 * 1024 * 1024 * 5, // 5GB
  };

  return {
    profile,
    appearance,
    trading,
    security,
    apiKeys,
    connectedAccounts,
    integrations,
    privacy,
    accessibility,
    account,
  };
}

export const mockSettingsData = generateMockSettings();
