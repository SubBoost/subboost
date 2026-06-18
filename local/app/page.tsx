"use client";

import * as React from "react";
import yaml from "js-yaml";
import { HomeSurface, type HomeSurfaceAdapter } from "@subboost/ui/product/home/home-surface";
import { buildConfigTransferDocument, parseConfigTransferDocument } from "@local/lib/config-transfer";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { toast } from "@subboost/ui/components/ui/toaster";
import { localHomeAdapter } from "./home-adapter";

function parseImportedConfigText(raw: string) {
  const parsed = yaml.load(raw);
  return parseConfigTransferDocument(parsed);
}

function LocalHomePage() {
  const importTemplateConfig = useConfigStore((state) => state.importTemplateConfig);

  const handleConfigExport = React.useCallback(() => {
    const state = useConfigStore.getState();
    const payload = buildConfigTransferDocument(state);
    const content = `${JSON.stringify(payload, null, 2)}\n`;
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "subboost-config-transfer.json";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast({ title: "配置已导出", variant: "success" });
  }, []);

  const handleConfigImport = React.useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.yaml,.yml";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const raw = await file.text();
        const config = parseImportedConfigText(raw);
        importTemplateConfig(config);
        toast({ title: "配置已导入", variant: "success" });
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "导入失败",
          variant: "destructive",
        });
      }
    };
    input.click();
  }, [importTemplateConfig]);

  return (
    <HomeSurface
      adapter={{
        ...localHomeAdapter,
        onConfigImport: handleConfigImport,
        onConfigExport: handleConfigExport,
      }}
    />
  );
}

export default function Page() {
  return <LocalHomePage />;
}
