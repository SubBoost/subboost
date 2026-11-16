import * as React from "react";
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
  // 打开着、可能有尚未应用到编辑器的输入的弹窗数；大于 0 时离开页面总会提示
  unappliedInputCount: number;
  changeUnappliedInputCount: (delta: 1 | -1) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  editingSubscription: null,
  setEditingSubscription: (subscription) => set({ editingSubscription: subscription }),
  clearEditingSubscription: () => set({ editingSubscription: null }),
  savedDraftSignature: null,
  setSavedDraftSignature: (signature) => set({ savedDraftSignature: signature }),
  unappliedInputCount: 0,
  changeUnappliedInputCount: (delta) =>
    set((state) => ({ unappliedInputCount: Math.max(0, state.unappliedInputCount + delta) })),
}));

/**
 * Counts as unsaved work while `active`: for a dialog whose input stays in local state until it is
 * applied, so leaving the page still warns when the editor itself matches what was saved.
 */
export function useUnappliedInputGuard(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const { changeUnappliedInputCount } = useUIStore.getState();
    changeUnappliedInputCount(1);
    return () => changeUnappliedInputCount(-1);
  }, [active]);
}
