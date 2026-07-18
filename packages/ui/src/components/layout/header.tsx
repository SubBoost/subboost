"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Home,
  LayoutDashboard,
  Library,
  HelpCircle,
  Menu,
  X,
  LogIn,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@subboost/ui/lib/utils";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import { UserMenu, type AccountMenuItem } from "@subboost/ui/components/auth/user-menu";
import { captureAuthConfigHandoff } from "@subboost/ui/store/config-store/auth-handoff";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { useUserStore } from "@subboost/ui/store/user-store";

type HeaderMode = "default" | "local";

export type HeaderBrandBadge = {
  label: string;
  href?: string;
  external?: boolean;
  title?: string;
  ariaLabel?: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  authOnly?: boolean;
};

const sharedNavItems: NavItem[] = [
  { href: "/", label: "首页", icon: Home },
  { href: "/dashboard", label: "我的订阅", icon: LayoutDashboard, authOnly: true },
  { href: "/templates", label: "模板库", icon: Library },
];

const defaultNavItems: NavItem[] = [
  ...sharedNavItems,
  { href: "/faq", label: "FAQ", icon: HelpCircle },
];

const localNavItems: NavItem[] = [
  ...sharedNavItems,
];

function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandBadge({ badge, tone = "default" }: { badge: HeaderBrandBadge; tone?: "default" | "new" }) {
  const className = cn(
    "inline-flex w-fit items-center rounded-full border px-1.5 py-[2px] text-[0.68rem] font-medium leading-none backdrop-blur-sm",
    tone === "new"
      ? "border-emerald-300/30 bg-emerald-400/12 text-emerald-100/90 shadow-[0_0_12px_rgba(52,211,153,0.16)]"
      : "border-sky-300/25 bg-sky-400/10 text-sky-100/80 shadow-[0_0_12px_rgba(56,189,248,0.16)]"
  );

  if (badge.href) {
    if (badge.external) {
      return (
        <a
          href={badge.href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(className, "transition-colors hover:text-white")}
          title={badge.title}
          aria-label={badge.ariaLabel}
        >
          {badge.label}
        </a>
      );
    }

    return (
      <Link
        href={badge.href}
        className={cn(className, "transition-colors hover:text-white")}
        title={badge.title}
        aria-label={badge.ariaLabel}
      >
        {badge.label}
      </Link>
    );
  }

  return (
    <span className={className} title={badge.title} aria-label={badge.ariaLabel}>
      {badge.label}
    </span>
  );
}

export function Header({
  mode = "default",
  extraBrandBadge = null,
  privilegedMenuItem,
}: {
  mode?: HeaderMode;
  extraBrandBadge?: HeaderBrandBadge | null;
  privilegedMenuItem?: AccountMenuItem;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const { user } = useUserStore();
  const canShowPrivilegedItem = Boolean(privilegedMenuItem && user?.isAdmin && !user.isBanned);
  const navItems = mode === "local" ? localNavItems : defaultNavItems;
  const visibleNavItems = user ? navItems : navItems.filter((i) => !i.authOnly);
  const showPrivilegedLink = mode === "default";
  const visiblePrivilegedItem = showPrivilegedLink && canShowPrivilegedItem ? privilegedMenuItem : null;
  const modeBadge: HeaderBrandBadge = {
    label: mode === "local" ? "self-host" : "online",
    title: mode === "local" ? "自部署入口" : "在线入口",
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/50 border-b border-white/5">
      <div className="w-full max-w-[clamp(1200px,95vw,2400px)] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Link href="/" className="group flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="SubBoost"
                width={36}
                height={36}
                className="rounded-xl shadow-lg shadow-blue-500/25 transition-shadow group-hover:shadow-blue-500/40"
              />
              <span className="hidden text-xl font-bold leading-none bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent sm:inline-flex">
                SubBoost
              </span>
            </Link>
            <span className="hidden flex-col items-start justify-center gap-1 leading-none sm:flex">
              {extraBrandBadge && <BrandBadge badge={extraBrandBadge} tone="new" />}
              <BrandBadge badge={modeBadge} />
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center rounded-full border border-white/10 bg-white/[0.04] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {visibleNavItems.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "border border-white/10 bg-white/10 text-white shadow-[0_10px_30px_rgba(15,23,42,0.22)]"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <item.icon className={cn("h-3.5 w-3.5", isActive ? "text-indigo-300" : "text-white/45")} />
                  {item.label}
                </Link>
              );
            })}
            {visiblePrivilegedItem && (
              <Link
                href={visiblePrivilegedItem.href}
                className={cn(
                  "ml-1 inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200",
                  isNavItemActive(pathname, visiblePrivilegedItem.href)
                    ? "border border-indigo-500/30 bg-indigo-500/15 text-indigo-200 shadow-[0_10px_30px_rgba(79,70,229,0.18)]"
                    : "text-indigo-300/75 hover:bg-indigo-500/10 hover:text-indigo-200"
                )}
              >
                <Shield className="h-3.5 w-3.5" />
                {visiblePrivilegedItem.label}
              </Link>
            )}
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center gap-2">
            {/* User Menu */}
            <UserMenu privilegedMenuItem={privilegedMenuItem} />

            {/* Mobile Menu Button */}
            <IconButton
              label={mobileMenuOpen ? "关闭导航菜单" : "打开导航菜单"}
              variant="ghost"
              aria-expanded={mobileMenuOpen}
              aria-controls="subboost-mobile-navigation"
              className="rounded-lg p-2 transition-colors hover:bg-white/5 md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-white/60" />
              ) : (
                <Menu className="w-5 h-5 text-white/60" />
              )}
            </IconButton>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div id="subboost-mobile-navigation" className="md:hidden border-t border-white/10 py-4">
            <nav className="flex flex-col gap-1">
              {visibleNavItems.map((item) => {
                const isActive = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors",
                      isActive
                        ? "text-white bg-white/5"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
              {visiblePrivilegedItem && (
                <Link
                  href={visiblePrivilegedItem.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors",
                    isNavItemActive(pathname, visiblePrivilegedItem.href)
                      ? "text-indigo-400 bg-indigo-500/10"
                      : "text-indigo-400/70 hover:text-indigo-400 hover:bg-white/5"
                  )}
                >
                  <Shield className="w-5 h-5" />
                  {visiblePrivilegedItem.label}
                </Link>
              )}
              {!user && (
                <Link
                  href="/login"
                  onClick={() => {
                    captureAuthConfigHandoff(useConfigStore.getState());
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-indigo-400 hover:text-indigo-300 hover:bg-white/5 transition-colors"
                >
                  <LogIn className="w-5 h-5" />
                  登录
                </Link>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
