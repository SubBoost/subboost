import { FileCode, Link2, Server } from "lucide-react";
import type { SourceType } from "@subboost/ui/store/config-store";

export type SourceTypeInfo = {
  label: string;
  icon: typeof Link2;
  placeholder: string;
  description: string;
};

export const sourceTypeInfo: Record<SourceType, SourceTypeInfo> = {
  url: {
    label: "订阅链接",
    icon: Link2,
    placeholder: "https://example.com/sub?token=xxx",
    description: "输入订阅链接，系统将自动获取节点",
  },
  yaml: {
    label: "YAML 配置",
    icon: FileCode,
    placeholder: "proxies:\n  - name: 节点名称\n    type: vmess # 也支持 tailscale 等协议（右上角「高级编辑」支持表单配置 Tailscale）\n    ...",
    description: "粘贴 Clash YAML 配置，支持通过「高级编辑」表单配置 Tailscale 节点",
  },
  nodes: {
    label: "节点链接",
    icon: Server,
    placeholder:
      "ss://...\nssr://...\nvmess://...\nvless://...\ntrojan://...\nanytls://...\nhysteria2://... / hy2://...\ntuic://...\n(socks5://... / socks4://...)",
    description: "每行一个节点链接，支持 ss/ssr/vmess/vless/trojan/anytls/hy2/tuic",
  },
};
