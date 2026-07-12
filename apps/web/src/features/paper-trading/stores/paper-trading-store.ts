import { create } from "zustand";
import type { PaperPosition } from "../types";

export type PaperTradingTab = "overview" | "history" | "journal" | "risk";

interface PaperTradingState {
  activeTab: PaperTradingTab;
  setActiveTab: (tab: PaperTradingTab) => void;
  
  selectedPosition: PaperPosition | null;
  setSelectedPosition: (position: PaperPosition | null) => void;
  
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const usePaperTradingStore = create<PaperTradingState>((set) => ({
  activeTab: "overview",
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  selectedPosition: null,
  setSelectedPosition: (pos) => set({ selectedPosition: pos }),
  
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
}));
