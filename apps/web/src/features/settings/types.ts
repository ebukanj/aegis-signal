export type Theme = "light" | "dark" | "system";
export type CompactMode = "default" | "compact";
export type FontScaling = "small" | "medium" | "large" | "x-large";

export interface UserProfile {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phoneNumber: string;
  country: string;
  timezone: string;
  preferredCurrency: string;
  biography: string;
  role: string;
  memberSince: number;
  avatarUrl?: string;
}

export interface AppearanceSettings {
  theme: Theme;
  accentColor: string;
  fontSize: FontScaling;
  compactMode: CompactMode;
  sidebarCollapsed: boolean;
  animationsEnabled: boolean;
  reducedMotion: boolean;
  chartTheme: "classic" | "modern" | "accessible";
  dashboardDensity: "comfortable" | "dense";
}

export interface TradingPreferences {
  defaultExchange: string;
  defaultTimeframe: string;
  defaultMarket: string;
  defaultRiskPct: number;
  preferredStrategy: string;
  defaultPositionSize: number;
  preferredMarketRegime: string;
  autoRefresh: boolean;
  autoSaveLayout: boolean;
}

export interface SecuritySession {
  id: string;
  device: string;
  browser: string;
  location: string;
  ipAddress: string;
  lastActive: number;
  isCurrent: boolean;
}

export interface SecuritySettings {
  twoFactorEnabled: boolean;
  recoveryCodesGenerated: boolean;
  securityScore: number;
  recentSessions: SecuritySession[];
}

export interface ApiKey {
  id: string;
  exchange: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  createdAt: number;
  lastUsed: number;
  status: "active" | "expired" | "revoked";
}

export interface ConnectedAccount {
  id: string;
  provider: "Google" | "GitHub" | "Apple" | "Discord" | "Telegram";
  status: "connected" | "disconnected";
  lastActivity: number | null;
  accountIdentifier?: string;
}

export interface Integration {
  id: string;
  service: "TradingView" | "Telegram" | "WhatsApp" | "Discord" | "Slack" | "Webhook" | "Google Sheets";
  status: "active" | "inactive" | "coming_soon";
  description: string;
}

export interface PrivacySettings {
  dataCollection: boolean;
  analyticsEnabled: boolean;
  cookiePreferences: "essential" | "all";
}

export interface AccessibilitySettings {
  fontScaling: FontScaling;
  highContrast: boolean;
  keyboardNavigation: boolean;
  reducedMotion: boolean;
  colorBlindMode: "none" | "protanopia" | "deuteranopia" | "tritanopia";
  screenReaderOptimization: boolean;
}

export interface AccountSettings {
  subscriptionPlan: string;
  storageUsedBytes: number;
  storageTotalBytes: number;
}
