import { create } from "zustand";

export type SettingsCategory = 
  | "profile" 
  | "appearance" 
  | "trading" 
  | "notifications" 
  | "security" 
  | "connected-accounts" 
  | "api-keys" 
  | "integrations" 
  | "privacy" 
  | "accessibility" 
  | "about" 
  | "account";

interface SettingsState {
  activeCategory: SettingsCategory;
  setActiveCategory: (category: SettingsCategory) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  activeCategory: "profile",
  setActiveCategory: (category) => set({ activeCategory: category }),
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
