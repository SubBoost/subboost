import type { SourceType } from "@subboost/ui/store/config-store";
import type { TemplateType } from "@subboost/core/types/config";
import { getTemplateList } from "@subboost/core/templates";
import { FileCode, Link2, Server } from "lucide-react";

export const sourceTypeInfo: Record<
  SourceType,
  { label: string; icon: typeof Link2; placeholder: string; description: string }
> = {
  url: {
    label: "订阅链接",
    icon: Link2,
    placeholder: "https://example.com/sub?token=xxx",
    description: "输入订阅链接，系统将自动获取节点",
  },
  yaml: {
    label: "YAML 配置",
    icon: FileCode,
    placeholder: "proxies:\n  - name: 节点名称\n    type: vmess\n    ...",
    description: "粘贴完整的 Clash YAML 配置文件",
  },
  nodes: {
    label: "节点链接",
    icon: Server,
    placeholder:
      "ss://...\nssr://...\nvmess://...\nvless://...\ntrojan://...\nanytls://...\nhysteria2://... / hy2://...\ntuic://...\n(socks5://... / socks4://...)",
    description: "每行一个节点链接，支持 ss/ssr/vmess/vless/trojan/anytls/hy2/tuic",
  },
};

const templateCounts = new Map(
  getTemplateList().map((template) => [template.id, { groups: template.groupCount, rules: template.ruleCount }])
);

function countsFor(id: TemplateType) {
  return templateCounts.get(id) ?? { groups: 0, rules: 0 };
}

export const templates = [
  {
    id: "minimal" as TemplateType,
    name: "精简版",
    description: "基础代理组 + 国内外分流",
    ...countsFor("minimal"),
  },
  {
    id: "standard" as TemplateType,
    name: "标准版",
    description: "完整代理组 + 常用规则",
    ...countsFor("standard"),
  },
  {
    id: "full" as TemplateType,
    name: "完整版",
    description: "全部功能 + 扩展规则集",
    ...countsFor("full"),
  },
];
