"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { getLocalAdminSetupCredentialError, LOCAL_ADMIN_PASSWORD_MIN_LENGTH } from "@local/lib/admin-credentials";
import { Button } from "@subboost/ui/components/ui/button";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { Input } from "@subboost/ui/components/ui/input";
import { PasswordField } from "@subboost/ui/components/ui/password-field";
import { hasAuthConfigHandoff } from "@subboost/ui/store/config-store/auth-handoff";

type AuthState = {
  setupRequired: boolean;
  authenticated: boolean;
};

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function getPostLoginHref(): string {
  return hasAuthConfigHandoff() ? "/" : "/dashboard";
}

export function LocalLogin() {
  const [auth, setAuth] = React.useState<AuthState | null>(null);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [setupToken, setSetupToken] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setSetupToken(fragment.get("setup-token")?.trim() || "");
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => readJson<AuthState>(response))
      .then((nextAuth) => {
        if (!cancelled) {
          setAuth(nextAuth);
          if (nextAuth.authenticated) window.location.href = getPostLoginHref();
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setupRequired = auth?.setupRequired === true;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const credentialError = setupRequired
      ? getLocalAdminSetupCredentialError({ username, password, passwordConfirm })
      : "";
    if (credentialError) {
      setError(credentialError);
      return;
    }
    if (setupRequired && !setupToken) {
      setError("缺少初始化令牌，请使用安装器输出的初始化链接");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(setupRequired ? "/api/setup/admin" : "/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(setupRequired ? { "X-SubBoost-Setup-Token": setupToken } : {}),
        },
        body: JSON.stringify({ username, password, passwordConfirm }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "登录失败");
      if (setupRequired) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      window.location.href = getPostLoginHref();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/logo.png" alt="SubBoost" width={64} height={64} className="rounded-2xl shadow-lg shadow-blue-500/25" />
          </Link>
          <h1 className="text-2xl font-bold mt-4 text-white">欢迎使用 SubBoost</h1>
          <p className="text-white/50 mt-2">{setupRequired ? "初始化本地管理员账号" : "登录以使用订阅管理功能"}</p>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-4">
          {auth ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <FormField label="管理员账号">
                <Input
                autoComplete="username"
                placeholder="管理员账号"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12"
                />
              </FormField>
              <PasswordField
                label="密码"
                autoComplete={setupRequired ? "new-password" : "current-password"}
                description={setupRequired ? `至少 ${LOCAL_ADMIN_PASSWORD_MIN_LENGTH} 个字符` : undefined}
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12"
              />
              {setupRequired && !setupToken ? (
                <p className="text-amber-300/80 text-xs">
                  请从安装器输出的初始化链接进入本页面。
                </p>
              ) : null}
              {setupRequired ? (
                <PasswordField
                  label="确认密码"
                  autoComplete="new-password"
                  placeholder="确认密码"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="h-12"
                />
              ) : null}

              {error ? (
                <p className="text-red-400 text-sm" aria-live="polite">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={loading || !username || !password || (setupRequired && !passwordConfirm)}
                className="h-12 w-full"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {setupRequired ? "创建管理员" : "登录"}
              </Button>
            </form>
          ) : (
            <div className="h-36 animate-pulse rounded-xl bg-white/5" />
          )}
        </div>
      </div>
    </div>
  );
}
