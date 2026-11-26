import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import type { WebUpdateStatus } from "@local/lib/web-update";
import { LocalUpdateCard } from "./local-update-card";

const mocks = vi.hoisted(() => ({
  useState: vi.fn(),
  button: vi.fn((props: React.ComponentProps<"button">) => React.createElement("button", props)),
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: mocks.useState,
}));
vi.mock("@subboost/ui/components/ui/button", () => ({ Button: mocks.button }));
vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({ confirmDialog: vi.fn() }));

const available = {
  currentVersion: "1.0.0", latestVersion: "1.1.0", hasUpdate: true,
  releaseUrl: "https://github.com/SubBoost/subboost/releases/tag/v1.1.0",
};

function renderCard(status: WebUpdateStatus | null, release: typeof available | null) {
  const setStatus = vi.fn();
  const setError = vi.fn();
  mocks.useState
    .mockReturnValueOnce([status, setStatus])
    .mockReturnValueOnce([release, vi.fn()])
    .mockReturnValueOnce(["", setError])
    .mockReturnValueOnce([false, vi.fn()]);
  const html = renderToStaticMarkup(React.createElement(LocalUpdateCard));
  return { html, setStatus, setError };
}

describe("local update card", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("shows the loading state, then the manual command when web updates are disabled", () => {
    expect(renderCard(null, null).html).toContain("正在检查更新");
    const { html } = renderCard("disabled", available);
    expect(html).toContain("subboost update");
    expect(html).toContain(available.releaseUrl);
    expect(mocks.button).not.toHaveBeenCalled();
  });

  it("hides the action when already up to date and disables it while an update is running", () => {
    expect(renderCard("idle", { ...available, hasUpdate: false }).html).toContain("1.0.0");
    expect(mocks.button).not.toHaveBeenCalled();
    expect(renderCard("running", available).html).toContain("正在备份和更新");
    expect(mocks.button.mock.lastCall?.[0].disabled).toBe(true);
  });

  it.each([202, 409, 503])("handles HTTP %i after the administrator confirms", async (code) => {
    vi.mocked(confirmDialog).mockResolvedValue(true);
    const post = vi.fn().mockResolvedValue(new Response(null, { status: code }));
    vi.stubGlobal("fetch", post);
    const { setStatus, setError } = renderCard("idle", available);
    const button = mocks.button.mock.lastCall![0];
    expect(button.disabled).toBe(false);
    button.onClick!({} as React.MouseEvent<HTMLButtonElement>);
    await vi.waitFor(() => {
      if (code === 503) expect(setError).toHaveBeenCalledWith("无法确认更新请求，请刷新查看状态。");
      else expect(setStatus).toHaveBeenCalledWith("queued");
    });
    expect(post).toHaveBeenCalledWith("/api/settings/web-update", { method: "POST" });
  });
});
