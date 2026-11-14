import { create } from "zustand";

type EditingSubscription = {
  id: string;
  token: string;
  name: string;
  autoUpdateInterval: number | null;
  smartNodeMatchingEnabled: boolean;
};

interface UIState {
  // 编辑“我的订阅”时的上下文（只保存在内存，不持久化到 localStorage；首页网址没有 editSubscriptionId 时会被清除）
  editingSubscription: EditingSubscription | null;
  setEditingSubscription: (subscription: EditingSubscription | null) => void;
  clearEditingSubscription: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  editingSubscription: null,
  setEditingSubscription: (subscription) => set({ editingSubscription: subscription }),
  clearEditingSubscription: () => set({ editingSubscription: null }),
}));


