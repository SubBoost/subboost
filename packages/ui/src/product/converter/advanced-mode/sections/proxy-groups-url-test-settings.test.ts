import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  switches: [] as Array<Record<string, any>>,
  inputs: [] as Array<Record<string, any>>,
  setUrlTestLazy: vi.fn(),
  setUrlTestTolerance: vi.fn(),
}));

vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: () => ({
    ...mocks.state,
    setUrlTestLazy: mocks.setUrlTestLazy,
    setUrlTestTolerance: mocks.setUrlTestTolerance,
  }),
}));

vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: Record<string, any>) => {
    mocks.switches.push(props);
    return React.createElement("button", { "data-checked": String(Boolean(props.checked)) });
  },
}));

vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: Record<string, any>) => {
    mocks.inputs.push(props);
    return React.createElement("input", props);
  },
}));

import { ProxyGroupsUrlTestSettings } from "./proxy-groups-url-test-settings";

describe("ProxyGroupsUrlTestSettings", () => {
  beforeEach(() => {
    mocks.state = { urlTestLazy: undefined, urlTestTolerance: undefined };
    mocks.switches = [];
    mocks.inputs = [];
    vi.clearAllMocks();
  });

  it("keeps legacy behavior until the global override is enabled", () => {
    const html = renderToStaticMarkup(React.createElement(ProxyGroupsUrlTestSettings));

    expect(html).toContain("URL-Test 全局参数");
    expect(html).toContain("兼容现有默认值");
    expect(mocks.switches).toHaveLength(1);
    expect(mocks.inputs).toHaveLength(0);

    mocks.switches[0].onCheckedChange(true);
    expect(mocks.setUrlTestLazy).toHaveBeenCalledWith(false);
  });

  it("edits lazy and tolerance and clears both when disabled", () => {
    mocks.state = { urlTestLazy: false, urlTestTolerance: undefined };
    renderToStaticMarkup(React.createElement(ProxyGroupsUrlTestSettings));

    expect(mocks.switches).toHaveLength(2);
    expect(mocks.inputs).toHaveLength(1);
    expect(mocks.inputs[0]).toMatchObject({ type: "number", min: 0, value: "" });

    mocks.switches[1].onCheckedChange(true);
    mocks.inputs[0].onChange({ target: { value: "50" } });
    expect(mocks.setUrlTestLazy).toHaveBeenCalledWith(true);
    expect(mocks.setUrlTestTolerance).toHaveBeenCalledWith(50);

    mocks.switches[0].onCheckedChange(false);
    expect(mocks.setUrlTestLazy).toHaveBeenCalledWith(undefined);
    expect(mocks.setUrlTestTolerance).toHaveBeenCalledWith(undefined);
  });

  it("ignores invalid tolerance input", () => {
    mocks.state = { urlTestLazy: true, urlTestTolerance: 50 };
    renderToStaticMarkup(React.createElement(ProxyGroupsUrlTestSettings));

    mocks.inputs[0].onChange({ target: { value: "-1" } });
    mocks.inputs[0].onChange({ target: { value: "1.5" } });
    expect(mocks.setUrlTestTolerance).not.toHaveBeenCalled();

    mocks.inputs[0].onChange({ target: { value: "" } });
    expect(mocks.setUrlTestTolerance).toHaveBeenCalledWith(undefined);
  });
});
