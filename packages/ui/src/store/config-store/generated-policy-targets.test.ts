import { describe, expect, it } from "vitest";
import { getGeneratedPolicyTargetContext } from "./generated-policy-targets";

describe("generated policy targets", () => {
  it("uses the actual generated groups and nodes in their fallback order", () => {
    expect(getGeneratedPolicyTargetContext("proxy-groups:\n  - name: Regional\nproxies:\n  - name: module:cn\n"))
      .toEqual({ availablePolicyTargets: ["Regional", "module:cn", "DIRECT", "REJECT"], fallbackPolicyTarget: "Regional" });
    expect(getGeneratedPolicyTargetContext("proxy-groups: []\nproxies:\n  - name: Node\n"))
      .toEqual({ availablePolicyTargets: ["Node", "DIRECT", "REJECT"], fallbackPolicyTarget: "Node" });
    expect(getGeneratedPolicyTargetContext("proxy-groups: []\nproxies: []\n"))
      .toEqual({ availablePolicyTargets: ["DIRECT", "REJECT"], fallbackPolicyTarget: "DIRECT" });
  });

  it("does not infer a policy context from empty or invalid generated YAML", () => {
    expect(getGeneratedPolicyTargetContext("")).toBeUndefined();
    expect(getGeneratedPolicyTargetContext("proxy-groups: [")).toBeUndefined();
    expect(getGeneratedPolicyTargetContext("proxy-groups: []")).toBeUndefined();
  });
});
