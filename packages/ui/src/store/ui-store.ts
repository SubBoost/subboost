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
  // 最近一次加载或保存订阅时的配置快照（只在内存）；离开页面时配置与它相同就不再提示未保存
  savedDraftSignature: string | null;
  setSavedDraftSignature: (signature: string | null) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  editingSubscription: null,
  setEditingSubscription: (subscription) => set({ editingSubscription: subscription }),
  clearEditingSubscription: () => set({ editingSubscription: null }),
  savedDraftSignature: null,
  setSavedDraftSignature: (signature) => set({ savedDraftSignature: signature }),
}));


