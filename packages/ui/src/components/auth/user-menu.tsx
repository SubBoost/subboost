"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@subboost/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@subboost/ui/components/ui/dropdown-menu";
import { SafeImage } from "@subboost/ui/components/ui/safe-image";
import { toast } from "@subboost/ui/components/ui/toaster";
import { captureAuthConfigHandoff } from "@subboost/ui/store/config-store/auth-handoff";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { useUserStore } from "@subboost/ui/store/user-store";
import { cn } from "@subboost/ui/lib/utils";
import {
  LogIn,
  LogOut,
  User as UserIcon,
  Settings,
  LayoutDashboard,
  ChevronDown,
  Shield,
} from "lucide-react";

export type AccountMenuItem = {
  href: string;
  label: string;
};

export function UserMenu({
  privilegedMenuItem,
  compactAtTablet = false,
}: {
  privilegedMenuItem?: AccountMenuItem;
  compactAtTablet?: boolean;
}) {
  const { user, isLoading: userLoading, fetchUser, logout: userLogout } = useUserStore();
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleLogout = async () => {
    try {
      if (user) await userLogout();
      setIsOpen(false);
      window.location.href = "/";
    } catch (error) {
      toast({
        title: "退出登录失败",
        description: error instanceof Error ? error.message : "会话服务暂时不可用，请稍后重试。",
        variant: "destructive",
      });
    }
  };

  const isLoading = userLoading && !user;

  if (isLoading) {
    return (
      <div className="h-8 w-8 rounded-full bg-ink/10 animate-pulse" />
    );
  }

  // 未登录
  if (!user) {
    return (
      <Button asChild size="sm" className="gap-2">
        <Link href="/login" onClick={() => captureAuthConfigHandoff(useConfigStore.getState())}>
          <LogIn className="h-4 w-4" />
          登录
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label="用户菜单"
          className="h-auto gap-2 px-2 py-1.5"
        >
          <SafeImage
            src={user.avatarUrl}
            alt={user.name || user.username}
            className="h-8 w-8 rounded-full border border-ink/20"
            fallback={
              <span className="flex h-8 w-8 items-center justify-center rounded-full [background:var(--avatar-bg)]">
                <UserIcon className="h-4 w-4 text-white" />
              </span>
            }
          />
          <span className={cn("hidden text-sm font-medium sm:block", compactAtTablet && "md:hidden lg:block")}>{user.name || user.username}</span>
          <ChevronDown className={`h-4 w-4 text-fg-50 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 border-ink/10 bg-surface-raised p-0 text-fg">
        <DropdownMenuLabel className="border-b border-ink/10 px-4 py-3 font-normal text-fg">
              <div className="flex items-center gap-3">
                <SafeImage
                  src={user.avatarUrl}
                  alt={user.name || user.username}
                  className="h-12 w-12 rounded-full border border-ink/20"
                  fallback={
                    <span className="flex h-12 w-12 items-center justify-center rounded-full [background:var(--avatar-bg)]">
                      <UserIcon className="h-6 w-6 text-white" />
                    </span>
                  }
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{user.name || user.username}</p>
                  <p className="text-xs text-fg-40 truncate">@{user.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-ink/5 text-xs text-indigo-400">
                  <Shield className="h-3 w-3" />
                  <span>Lv.{user.trustLevel}</span>
                </div>
                {user.isAdmin && !user.isBanned && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-xs text-indigo-400">
                    <Shield className="h-3 w-3" />
                    <span>管理员</span>
                  </div>
                )}
                <div className="text-xs text-fg-40">
                  {user.subscriptionCount}/{user.quota.maxSubscriptions} 订阅
                </div>
              </div>
        </DropdownMenuLabel>
        <div className="py-1">
          {privilegedMenuItem && user.isAdmin && !user.isBanned && (
            <DropdownMenuItem asChild className="rounded-none px-4 py-2 text-privileged-menu-fg focus:bg-ink/5 focus:text-indigo-400">
                <Link
                  href={privilegedMenuItem.href}
                  className="flex items-center gap-3 text-sm"
                >
                  <Settings className="h-4 w-4" />
                  {privilegedMenuItem.label}
                </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild className="rounded-none px-4 py-2 text-fg-60 focus:bg-ink/5 focus:text-fg">
              <Link
                href="/dashboard"
                className="flex items-center gap-3 text-sm"
              >
                <LayoutDashboard className="h-4 w-4" />
                我的订阅
              </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="rounded-none px-4 py-2 text-fg-60 focus:bg-ink/5 focus:text-fg">
              <Link
                href="/dashboard/settings"
                className="flex items-center gap-3 text-sm"
              >
                <Settings className="h-4 w-4" />
                账户设置
              </Link>
          </DropdownMenuItem>
        </div>
        <DropdownMenuSeparator className="m-0 bg-ink/10" />
        <DropdownMenuItem
          onSelect={() => void handleLogout()}
          className="rounded-none px-4 py-2 text-red-400 focus:bg-ink/5 focus:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
