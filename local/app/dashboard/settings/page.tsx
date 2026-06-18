"use client";

import * as React from "react";
import { LogOut, ServerCog, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { Input } from "@subboost/ui/components/ui/input";
import { toast } from "@subboost/ui/components/ui/toaster";
import { withCsrfHeaders } from "@subboost/ui/lib/csrf";
import { useUserStore } from "@subboost/ui/store/user-store";

type LocalUserSummary = {
  id: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  subscriptionCount: number;
  templateCount: number;
};

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function SettingsPage() {
  const { user, fetchUser, logout } = useUserStore();
  const [users, setUsers] = React.useState<LocalUserSummary[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = React.useState(false);
  const [profileUsername, setProfileUsername] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [creatingUsername, setCreatingUsername] = React.useState("");
  const [creatingPassword, setCreatingPassword] = React.useState("");
  const [creatingPasswordConfirm, setCreatingPasswordConfirm] = React.useState("");
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [creatingUser, setCreatingUser] = React.useState(false);

  const loadUsers = React.useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const data = await readJson<{ users?: LocalUserSummary[]; error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "加载用户列表失败");
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "加载用户列表失败", variant: "destructive" });
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchUser();
    void loadUsers();
  }, [fetchUser, loadUsers]);

  React.useEffect(() => {
    setProfileUsername(user?.username ?? "");
  }, [user?.username]);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const response = await fetch("/api/users/me", {
        method: "PUT",
        headers: withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          username: profileUsername,
          currentPassword,
          newPassword,
          passwordConfirm,
        }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "保存失败");

      setCurrentPassword("");
      setNewPassword("");
      setPasswordConfirm("");
      await Promise.all([fetchUser(), loadUsers()]);
      toast({ title: "账户信息已更新", variant: "success" });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "保存失败", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateUser = async () => {
    setCreatingUser(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          username: creatingUsername,
          password: creatingPassword,
          passwordConfirm: creatingPasswordConfirm,
        }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "创建失败");

      setCreatingUsername("");
      setCreatingPassword("");
      setCreatingPasswordConfirm("");
      await loadUsers();
      toast({ title: "新账号已创建", variant: "success" });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "创建失败", variant: "destructive" });
    } finally {
      setCreatingUser(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">账户设置</h1>
        <p className="text-white/50">管理当前账号、团队账号和运行端点</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="rounded-lg bg-indigo-500/20 p-2 text-indigo-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">当前账号</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-white/40 mb-1">用户名</p>
              <Input value={profileUsername} onChange={(event) => setProfileUsername(event.target.value)} />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1">当前密码</p>
              <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1">新密码</p>
              <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1">确认新密码</p>
              <Input
                type="password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void handleSaveProfile()} disabled={savingProfile || !profileUsername.trim()}>
                保存
              </Button>
              <Button variant="destructive" className="gap-2" onClick={() => void handleLogout()} disabled={!user}>
                <LogOut className="h-4 w-4" />
                退出登录
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-300">
              <UserPlus className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">创建账号</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="用户名" value={creatingUsername} onChange={(event) => setCreatingUsername(event.target.value)} />
            <Input
              type="password"
              placeholder="密码（至少 12 位）"
              value={creatingPassword}
              onChange={(event) => setCreatingPassword(event.target.value)}
            />
            <Input
              type="password"
              placeholder="确认密码"
              value={creatingPasswordConfirm}
              onChange={(event) => setCreatingPasswordConfirm(event.target.value)}
            />
            <Button onClick={() => void handleCreateUser()} disabled={creatingUser || !creatingUsername.trim()}>
              创建账号
            </Button>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="rounded-lg bg-sky-500/20 p-2 text-sky-300">
              <ServerCog className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">运行端点</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-white/60">
            <div>
              <p className="text-xs text-white/40">存活检查</p>
              <code className="mt-1 block rounded-md bg-white/5 px-3 py-2 text-white/70">/api/health/live</code>
            </div>
            <div>
              <p className="text-xs text-white/40">就绪检查</p>
              <code className="mt-1 block rounded-md bg-white/5 px-3 py-2 text-white/70">/api/health/ready</code>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <div className="rounded-lg bg-amber-500/20 p-2 text-amber-300">
            <Users className="h-5 w-5" />
          </div>
          <CardTitle className="text-base">账号列表</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingUsers ? (
            <p className="text-white/50">加载中...</p>
          ) : users.length === 0 ? (
            <p className="text-white/50">暂无账号</p>
          ) : (
            <div className="space-y-3">
              {users.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium">{item.username}</div>
                      <div className="text-xs text-white/45">
                        创建于 {formatDate(item.createdAt)}，最近登录 {formatDate(item.lastLoginAt)}
                      </div>
                    </div>
                    <div className="text-sm text-white/60">
                      {item.subscriptionCount} 个订阅 / {item.templateCount} 个模板记录
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
