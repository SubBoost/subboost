import { beforeEach, describe, expect, it } from "vitest";
import {
  createHarness,
  node,
  resetSourceActionMocks,
  source,
} from "./source-actions.test-utils";

describe("createSourceActions relay group references", () => {
  beforeEach(resetSourceActionMocks);

  it("keeps enabled custom and effective built-in groups when source removal filters dialer relays", () => {
    const migratedCustomGroupName = "🧩 筛选组  美国";
    const { actions, getState } = createHarness({
      sources: [source({ id: "s1" }), source({ id: "s2" })],
      nodes: [
        node("Removed", { _sourceIds: ["s1"] }),
        node("Remaining", { _sourceIds: ["s2"] }),
      ],
      enabledProxyGroups: ["auto"],
      customProxyGroups: [
        { id: "legacy-us", name: migratedCustomGroupName, emoji: "🧩", enabled: true, groupType: "select" },
        { id: "disabled", name: "🧩 已停用", emoji: "🧩", enabled: false, groupType: "select" },
      ],
      proxyGroupNameOverrides: { auto: "自定义自动", adult: "私密" },
      dialerProxyGroups: [
        {
          id: "dialer-1",
          name: "Relay",
          relayNodes: [
            migratedCustomGroupName,
            `  ${migratedCustomGroupName}  `,
            "⚡ 自定义自动",
            "DIRECT",
            "Removed",
            "Remaining",
            "🧩 已停用",
            "🧩 不存在",
            "🔞 私密",
          ],
          targetNodes: [migratedCustomGroupName, "⚡ 自定义自动", "Removed", "Remaining"],
        },
      ],
    });

    actions.setSources([source({ id: "s2" })]);

    expect(getState().dialerProxyGroups[0]).toMatchObject({
      relayNodes: [migratedCustomGroupName, "⚡ 自定义自动", "DIRECT", "Remaining"],
      targetNodes: ["Remaining"],
    });
  });
});
