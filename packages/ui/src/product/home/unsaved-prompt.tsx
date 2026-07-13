"use client";

import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import { isSourcePendingImport } from "@subboost/ui/product/subscription/source-import-state";
import { useConfigStore } from "@subboost/ui/store/config-store";

/** Warns before a browser refresh or close would discard imported work. */
export function UnsavedPrompt() {
  const { nodes, sources } = useConfigStore(
    useShallow((state) => ({ nodes: state.nodes, sources: state.sources }))
  );
  const hasUnsavedChanges = React.useMemo(
    () => nodes.length > 0 || sources.some(isSourcePendingImport),
    [nodes, sources]
  );

  React.useEffect(() => {
    if (typeof navigator !== "undefined" && (navigator as { webdriver?: boolean }).webdriver) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "您有未保存的配置更改，确定要离开吗？";
      return event.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  return null;
}
