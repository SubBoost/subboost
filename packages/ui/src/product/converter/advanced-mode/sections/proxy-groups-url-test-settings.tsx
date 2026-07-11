"use client";

import { Input } from "@subboost/ui/components/ui/input";
import { Switch } from "@subboost/ui/components/ui/switch";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { useShallow } from "zustand/react/shallow";

export function ProxyGroupsUrlTestSettings() {
  const {
    urlTestLazy,
    urlTestTolerance,
    setUrlTestLazy,
    setUrlTestTolerance,
  } = useConfigStore(
    useShallow((state) => ({
      urlTestLazy: state.urlTestLazy,
      urlTestTolerance: state.urlTestTolerance,
      setUrlTestLazy: state.setUrlTestLazy,
      setUrlTestTolerance: state.setUrlTestTolerance,
    })),
  );
  const overrideEnabled = urlTestLazy !== undefined || urlTestTolerance !== undefined;

  const setOverrideEnabled = (enabled: boolean) => {
    if (enabled) {
      setUrlTestLazy(false);
      return;
    }
    setUrlTestLazy(undefined);
    setUrlTestTolerance(undefined);
  };

  const setToleranceFromInput = (raw: string) => {
    if (raw === "") {
      setUrlTestTolerance(undefined);
      return;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) return;
    setUrlTestTolerance(value);
  };

  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-white/75">URL-Test 全局参数</div>
          <div className="mt-0.5 text-[10px] text-white/40">
            {overrideEnabled ? "统一覆盖所有自动测速代理组" : "兼容现有默认值"}
          </div>
        </div>
        <Switch
          aria-label="启用 URL-Test 全局参数"
          checked={overrideEnabled}
          onCheckedChange={setOverrideEnabled}
        />
      </div>

      {overrideEnabled && (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 border-t border-white/10 pt-2">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-white/65">lazy</div>
              <div className="text-[10px] text-white/35">按需触发测速</div>
            </div>
            <Switch
              aria-label="URL-Test lazy"
              checked={urlTestLazy === true}
              onCheckedChange={setUrlTestLazy}
            />
          </div>
          <label className="space-y-1">
            <span className="block text-xs text-white/65">tolerance</span>
            <Input
              aria-label="URL-Test tolerance"
              type="number"
              min={0}
              step={1}
              value={urlTestTolerance ?? ""}
              placeholder="不生成"
              onChange={(event) => setToleranceFromInput(event.target.value)}
              className="h-8 text-xs"
            />
          </label>
        </div>
      )}
    </div>
  );
}
