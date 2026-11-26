"use client";

import * as React from "react";
import { Header, type HeaderBrandBadge } from "@subboost/ui/components/layout/header";
import { useUserStore } from "@subboost/ui/store/user-store";

type LatestReleaseStatus = {
  hasUpdate?: unknown;
  latestTag?: unknown;
  releaseUrl?: unknown;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildNewReleaseBadge(status: LatestReleaseStatus | null): HeaderBrandBadge | null {
  if (status?.hasUpdate !== true) return null;
  const releaseUrl = readString(status.releaseUrl);
  if (!releaseUrl) return null;

  const latestTag = readString(status.latestTag);
  return {
    label: "new",
    href: releaseUrl,
    external: true,
    title: latestTag ? `SubBoost ${latestTag} 已发布` : "SubBoost 有新版本",
    ariaLabel: latestTag ? `SubBoost ${latestTag} 已发布` : "SubBoost 有新版本",
  };
}

export function LocalHeader() {
  const user = useUserStore((state) => state.user);
  const [newReleaseBadge, setNewReleaseBadge] = React.useState<HeaderBrandBadge | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/releases/latest", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
          signal: controller.signal,
        });
        if (!response.ok) return;

        const status = (await response.json().catch(() => null)) as LatestReleaseStatus | null;
        if (active) setNewReleaseBadge(buildNewReleaseBadge(status));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (active) setNewReleaseBadge(null);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const badge = user && newReleaseBadge
    ? { ...newReleaseBadge, href: "/dashboard/settings#system-update", external: false }
    : newReleaseBadge;
  return <Header mode="local" extraBrandBadge={badge} />;
}
