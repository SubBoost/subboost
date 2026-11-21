"use client";

import * as React from "react";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import type { WebUpdateStatus } from "@local/lib/web-update";

type ReleaseStatus = {
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  hasUpdate: boolean;
};

const UPDATE_ENDPOINT = "/api/settings/web-update";

const statusText: Record<WebUpdateStatus, string> = {
  disabled: "宿主机尚未启用网页更新。",
  idle: "",
  queued: "更新已排队，正在等待宿主机。",
  running: "正在备份和更新，服务可能会短暂中断。",
  succeeded: "更新完成。",
  failed: "更新失败，请查看宿主机的 subboost-web-update 服务日志。",
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  if (!response.ok) throw new Error("Unable to read update status.");
  return response.json() as Promise<T>;
}

export function LocalUpdateCard() {
  const [status, setStatus] = React.useState<WebUpdateStatus | null>(null);
  const [release, setRelease] = React.useState<ReleaseStatus | null>(null);
  const [loadingError, setLoadingError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const busy = status === "queued" || status === "running";

  React.useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    async function refresh() {
      try {
        const { status: nextStatus } = await fetchJson<{ status: WebUpdateStatus }>(UPDATE_ENDPOINT, options);
        setStatus(nextStatus);
        if (nextStatus !== "queued" && nextStatus !== "running") {
          setRelease(await fetchJson<ReleaseStatus>("/api/releases/latest", options));
        }
        setLoadingError("");
      } catch {
        if (!controller.signal.aborted && !busy) setLoadingError("无法加载更新状态，请刷新重试。");
      }
    }
    void refresh();
    const timer = busy ? window.setInterval(() => void refresh(), 3000) : undefined;
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [busy]);

  async function startUpdate() {
    if (!(await confirmDialog({
      title: "确认更新 SubBoost",
      description: "宿主机会先备份数据库。更新期间订阅服务可能会短暂中断。",
      confirmText: "开始更新",
    }))) return;

    setSubmitting(true);
    setLoadingError("");
    try {
      const response = await fetch(UPDATE_ENDPOINT, { method: "POST" });
      if (!response.ok && response.status !== 409) throw new Error("Update could not be queued.");
      setStatus("queued");
    } catch {
      setLoadingError("无法确认更新请求，请刷新查看状态。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card id="system-update">
      <CardHeader><CardTitle className="text-base">系统更新</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm text-fg-60">
        {release && <p>当前版本 {release.currentVersion}</p>}
        {release?.hasUpdate && (
          <p>
            可用版本 {release.latestVersion}
            {release.releaseUrl && (
              <a className="ml-2 underline" href={release.releaseUrl} target="_blank" rel="noreferrer">发行说明</a>
            )}
          </p>
        )}
        <p role="status">{status ? statusText[status] : "正在检查更新…"}</p>
        {status === "disabled" && release?.hasUpdate && <p>可在宿主机运行 <code>subboost update</code>。</p>}
        {release?.hasUpdate && status && status !== "disabled" && (
          <Button disabled={busy || submitting} onClick={() => void startUpdate()}>网页更新</Button>
        )}
        {loadingError && <p role="alert">{loadingError}</p>}
      </CardContent>
    </Card>
  );
}
