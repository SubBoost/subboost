"use client";

import * as React from "react";
import { Trash2, Users } from "lucide-react";

import { LOCAL_ADMIN_PASSWORD_MIN_LENGTH } from "@local/lib/admin-credentials";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { Input } from "@subboost/ui/components/ui/input";
import { PasswordField } from "@subboost/ui/components/ui/password-field";

type LocalAccount = {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
  createdAt: string;
  lastLoginAt: string | null;
};

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === "string" && body.error.trim() ? body.error : fallback;
}

export function LocalAccountManagement() {
  const [accounts, setAccounts] = React.useState<LocalAccount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const loadAccounts = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (!response.ok) throw new Error(await readErrorMessage(response, "加载失败，请刷新重试"));
      const body = (await response.json()) as { users?: unknown };
      if (!Array.isArray(body.users)) throw new Error("加载失败，请刷新重试");
      setAccounts(body.users as LocalAccount[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败，请刷新重试");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, passwordConfirm }),
      });
      if (!response.ok) throw new Error(await readErrorMessage(response, "创建失败，请重试"));
      setUsername("");
      setPassword("");
      setPasswordConfirm("");
      await loadAccounts();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建失败，请重试");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      return;
    }
    setDeleteConfirmId(null);
    setDeletingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readErrorMessage(response, "删除失败，请重试"));
      await loadAccounts();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败，请重试");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <div className="rounded-lg bg-violet-500/20 p-2 text-violet-300">
          <Users className="h-5 w-5" />
        </div>
        <CardTitle className="text-base">多账号管理</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-fg-60">每个账号的订阅和模板相互隔离。删除账号会一并删除该账号的订阅和模板。</p>
        {loading ? (
          <p className="text-sm text-fg-50">加载中…</p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3 rounded-md bg-ink/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{account.username}</p>
                  <p className="text-xs text-fg-50">
                    {account.role === "ADMIN" ? "管理员" : "普通账号"}
                    {account.lastLoginAt ? ` · 上次登录 ${new Date(account.lastLoginAt).toLocaleString()}` : ""}
                  </p>
                </div>
                {account.role !== "ADMIN" && (
                  <Button
                    variant={deleteConfirmId === account.id ? "destructive" : "outline"}
                    size="sm"
                    disabled={deletingId === account.id}
                    onClick={() => void handleDelete(account.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleteConfirmId === account.id ? "确认删除？" : "删除"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleCreate} className="space-y-3 border-t border-ink/10 pt-4">
          <FormField label="新建账号">
            <Input
              autoComplete="username"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </FormField>
          <PasswordField
            label="密码"
            autoComplete="new-password"
            description={`至少 ${LOCAL_ADMIN_PASSWORD_MIN_LENGTH} 个字符`}
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordField
            label="确认密码"
            autoComplete="new-password"
            placeholder="确认密码"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
          {error ? (
            <p className="text-sm text-red-400" aria-live="polite">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={creating || !username || !password || !passwordConfirm}>
            {creating ? "创建中…" : "创建账号"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
