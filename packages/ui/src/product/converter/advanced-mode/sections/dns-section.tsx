"use client";

import { AlertTriangle, Globe } from "lucide-react";
import { DEFAULT_SUBBOOST_CONFIG } from "@subboost/core/config/defaults";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Textarea } from "@subboost/ui/components/ui/textarea";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { SectionHeader } from "../section-header";

export function DnsSection({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { dnsYaml, generatedYamlError, setDnsYaml } = useConfigStore();

  return (
    <div>
      <SectionHeader
        icon={Globe}
        title="基础和DNS配置"
        isExpanded={isExpanded}
        onToggle={onToggle}
        badge={
          <Badge variant="outline" className="ml-auto border-ink/15 bg-ink/5 text-fg-60">
            YAML
          </Badge>
        }
      />
      {isExpanded && (
        <div className="mt-2 pl-6">
          <Textarea
            value={dnsYaml}
            onChange={(e) => setDnsYaml(e.target.value)}
            className="font-mono text-xs min-h-[400px] bg-ink/5 border-ink/10"
            placeholder={`# 基础配置
mixed-port: ${DEFAULT_SUBBOOST_CONFIG.mixedPort}
allow-lan: ${DEFAULT_SUBBOOST_CONFIG.allowLan}
...

# DNS 配置
dns:
  enable: true
  ...`}
          />
          {generatedYamlError && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-300" />
              <span className="whitespace-pre-wrap break-words">{generatedYamlError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
