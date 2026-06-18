"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Eye, Home, Settings2, User, type LucideIcon } from "lucide-react";
import { cn } from "@subboost/ui/lib/utils";
import { zeroRightClassName } from "react-remove-scroll-bar";
import { useUserStore } from "@subboost/ui/store/user-store";

type MobileNavItem = {
  id: "config" | "preview" | "ai" | "dashboard" | "home";
  href: string;
  label: string;
  icon: LucideIcon;
  hash?: string;
  authOnly?: boolean;
};

const defaultMobileNavItems: MobileNavItem[] = [
  { id: "config", href: "/#config", label: "配置", icon: Settings2, hash: "config" },
  { id: "preview", href: "/#preview", label: "预览", icon: Eye, hash: "preview" },
  { id: "ai", href: "/#ai", label: "AI", icon: Bot, hash: "ai", authOnly: true },
  { id: "dashboard", href: "/dashboard", label: "我的", icon: User, authOnly: true },
];

const localMobileNavItems: MobileNavItem[] = [
  { id: "home", href: "/", label: "首页", icon: Home },
  { id: "dashboard", href: "/dashboard", label: "订阅", icon: User, authOnly: true },
];

export function MobileNav({ mode = "default" }: { mode?: "default" | "local" }) {
  const pathname = usePathname();
  const { user } = useUserStore();
  const [activeHash, setActiveHash] = React.useState<string>("");

  React.useEffect(() => {
    const readHash = () => window.location.hash.replace(/^#/, "");
    const update = () => setActiveHash(readHash());
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const isHome = pathname === "/";
  const items = mode === "local" ? localMobileNavItems : defaultMobileNavItems;
  const visibleItems = user ? items : items.filter((i) => !i.authOnly);

  // 只在移动端显示
  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-white/5 bg-black/50 backdrop-blur-xl",
        zeroRightClassName
      )}
    >
      <div className="flex items-center justify-around h-16">
        {visibleItems.map((item) => {
          const isAnchor = Boolean(item.hash);
          const isActive = isAnchor
            ? isHome && activeHash === item.hash
            : item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => {
                if (item.hash && isHome) {
                  event.preventDefault();
                  const el = document.getElementById(item.hash);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  window.history.replaceState(null, "", `/#${item.hash}`);
                  setActiveHash(item.hash);
                }
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 w-full h-full transition-colors",
                isActive ? "text-indigo-400" : "text-white/40 hover:text-white/60"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
