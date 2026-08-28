import { describe, expect, it } from "vitest";
import { getValidDialerRelayGroupNames } from "./dialer-relay-group-names";

describe("dialer relay group names", () => {
  it("resolves enabled custom and overridden builtin names", () => {
    expect(
      getValidDialerRelayGroupNames({
        customProxyGroups: [
          { name: " 🧩 筛选组  美国 " },
          { name: "🧩 已停用", enabled: false },
        ],
        enabledGroups: ["auto"],
        proxyGroupNameOverrides: { auto: "自定义自动", adult: "私密" },
      })
    ).toEqual(new Set(["🧩 筛选组  美国", "⚡ 自定义自动"]));
  });

  it("uses caller defaults when enabled groups are absent, empty, or malformed", () => {
    const config = { proxyGroupNameOverrides: { auto: "自定义自动" } };
    expect(getValidDialerRelayGroupNames(config, { defaultEnabledGroups: ["auto"] })).toEqual(
      new Set(["⚡ 自定义自动"])
    );
    expect(getValidDialerRelayGroupNames({ ...config, enabledGroups: [] }, { defaultEnabledGroups: ["auto"] })).toEqual(
      new Set(["⚡ 自定义自动"])
    );
    expect(
      getValidDialerRelayGroupNames(
        { ...config, enabledGroups: "auto" },
        { defaultEnabledGroups: ["auto"] }
      )
    ).toEqual(new Set(["⚡ 自定义自动"]));
  });

  it("falls back to no builtin groups when neither config nor defaults enable them", () => {
    expect(getValidDialerRelayGroupNames({})).toEqual(new Set());
  });
});
