"use client";

import * as React from "react";
import { isSourcePendingImport } from "@subboost/ui/product/subscription/source-import-state";
import { useConfigStore, type ConfigState } from "@subboost/ui/store/config-store";
import { useUIStore } from "@subboost/ui/store/ui-store";

// Derived or in-progress state. Everything else counts, so a newly added setting is
// treated as unsaved until saved rather than silently dropped on leaving.
const DERIVED_DRAFT_FIELDS = new Set<string>([
  "draftRevision",
  "parseErrors",
  "isLoading",
  "generatedYaml",
  "generatedYamlError",
  "history",
  "historyIndex",
]);

/** The editor's config as one comparable string. */
export function getDraftSignature(state: Partial<ConfigState>): string {
  const draft: Record<string, unknown> = {};
  for (const key of Object.keys(state).sort()) {
    const value = (state as Record<string, unknown>)[key];
    if (typeof value !== "function" && !DERIVED_DRAFT_FIELDS.has(key)) draft[key] = value;
  }
  return JSON.stringify(draft);
}

/** Records the editor content as saved, so leaving without further changes does not warn. */
export function markDraftSaved(signature = getDraftSignature(useConfigStore.getState())) {
  useUIStore.getState().setSavedDraftSignature(signature);
}

function hasUnsavedWork(state: ConfigState): boolean {
  if (useUIStore.getState().unappliedInputCount > 0) return true;
  if (state.sources.some(isSourcePendingImport)) return true;
  if (state.nodes.length === 0) return false;
  return useUIStore.getState().savedDraftSignature !== getDraftSignature(state);
}

/** Warns before a browser refresh or close would discard imported work that is not saved. */
export function UnsavedPrompt() {
  React.useEffect(() => {
    if (typeof navigator !== "undefined" && (navigator as { webdriver?: boolean }).webdriver) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedWork(useConfigStore.getState())) return;
      event.preventDefault();
      event.returnValue = "您有未保存的配置更改，确定要离开吗？";
      return event.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return null;
}
