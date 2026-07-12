import { create } from "zustand";

export type AdminCategory = 
  | "dashboard" 
  | "health" 
  | "users" 
  | "roles" 
  | "strategies" 
  | "exchanges" 
  | "scanner" 
  | "queues" 
  | "workers" 
  | "notifications" 
  | "ai-providers" 
  | "feature-flags" 
  | "audit-logs" 
  | "system-logs" 
  | "monitoring" 
  | "configuration" 
  | "maintenance";

interface AdminState {
  activeCategory: AdminCategory;
  setActiveCategory: (category: AdminCategory) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  activeCategory: "dashboard",
  setActiveCategory: (category) => set({ activeCategory: category }),
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
