import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@subboost/ui/lib/utils";

const PROTOCOL_BADGE_COLORS: Record<string, string> = {
  ss: "bg-blue-500/20 text-blue-200 border-blue-500/20",
  ssr: "bg-blue-500/20 text-blue-200 border-blue-500/20",
  vmess: "bg-purple-500/20 text-purple-200 border-purple-500/20",
  vless: "bg-emerald-500/20 text-emerald-200 border-emerald-500/20",
  trojan: "bg-red-500/20 text-red-200 border-red-500/20",
  anytls: "bg-teal-500/20 text-teal-200 border-teal-500/20",
  hysteria2: "bg-orange-500/20 text-orange-200 border-orange-500/20",
  hy2: "bg-orange-500/20 text-orange-200 border-orange-500/20",
  tuic: "bg-cyan-500/20 text-cyan-200 border-cyan-500/20",
  socks5: "bg-slate-500/20 text-slate-200 border-slate-500/20",
  socks4: "bg-slate-500/20 text-slate-200 border-slate-500/20",
  http: "bg-amber-500/20 text-amber-200 border-amber-500/20",
  https: "bg-amber-500/20 text-amber-200 border-amber-500/20",
  ssh: "bg-pink-500/20 text-pink-200 border-pink-500/20",
  relay: "bg-violet-500/20 text-violet-200 border-violet-500/20",
  tailscale: "bg-sky-500/20 text-sky-200 border-sky-500/20",
};

const DEFAULT_PROTOCOL_BADGE_CLASS = "bg-slate-500/20 text-slate-200 border-slate-500/20";

export function getProtocolBadgeClass(type: string | undefined): string {
  const key = (type ?? "").trim().toLowerCase();
  return Object.hasOwn(PROTOCOL_BADGE_COLORS, key) ? PROTOCOL_BADGE_COLORS[key] : DEFAULT_PROTOCOL_BADGE_CLASS;
}

type ProtocolBadgeProps = ComponentPropsWithoutRef<"span"> & {
  type: string | undefined;
};

export function ProtocolBadge({ type, className, ...props }: ProtocolBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] text-center uppercase whitespace-nowrap",
        getProtocolBadgeClass(type),
        className
      )}
      {...props}
    >
      {type}
    </span>
  );
}
