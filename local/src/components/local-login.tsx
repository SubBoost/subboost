"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { hasAuthConfigHandoff } from "@subboost/ui/store/config-store/auth-handoff";
import { setCsrfToken, withCsrfHeaders } from "@subboost/ui/lib/csrf";

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
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/bootstrap", { cache: "no-store" })
      .then((response) => readJson<AuthState>(response))
      .then((nextAuth) => {
        if (!cancelled) {
          setAuth(nextAuth);
          setCsrfToken((nextAuth as AuthState & { csrfToken?: string | null }).csrfToken ?? null);
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
    if (setupRequired && password !== passwordConfirm) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(setupRequired ? "/api/setup/admin" : "/api/auth/login", {
        method: "POST",
        headers: withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ username, password, passwordConfirm }),
      });
      const data = await readJson<{ error?: string; csrfToken?: string | null }>(response);
      setCsrfToken(data.csrfToken ?? null);
      if (!response.ok) throw new Error(data.error || "登录失败");
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
          <p className="text-white/50 mt-2">{setupRequired ? "初始化第一个账号" : "登录以使用订阅管理功能"}</p>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-4">
          {auth ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                autoComplete="username"
                placeholder="账号"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={setupRequired ? "new-password" : "current-password"}
                  placeholder="密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-colors pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {setupRequired ? (
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="确认密码"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              ) : null}

              {error ? (
                <p className="text-red-400 text-sm" aria-live="polite">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading || !username || !password || (setupRequired && !passwordConfirm)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 btn-primary"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {setupRequired ? "创建账号" : "登录"}
              </button>
            </form>
          ) : (
            <div className="h-36 animate-pulse rounded-xl bg-white/5" />
          )}
        </div>
      </div>
    </div>
  );
}
