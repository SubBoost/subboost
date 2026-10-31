import { loadMihomoYaml } from "@subboost/core/config/yaml-schema";
import { buildPolicyTargetContext } from "@subboost/core/generator/policy-targets";
import { isSubscriptionInfoNodeName } from "@subboost/core/subscription/info-node-name";

/** Read the exact targets and fallback of the configuration currently shown to the user. */
export function getGeneratedPolicyTargetContext(yaml: string | undefined) {
  if (!yaml?.trim()) return undefined;
  try {
    const config = loadMihomoYaml(yaml) as Record<string, unknown> | null;
    if (!config || !Array.isArray(config["proxy-groups"]) || !Array.isArray(config.proxies)) return undefined;
    const names = (items: unknown[]) => items.flatMap((item) => {
      if (!item || typeof item !== "object" || !("name" in item) || typeof item.name !== "string") return [];
      return [item.name];
    });
    return buildPolicyTargetContext(
      names(config["proxy-groups"]),
      names(config.proxies).filter((name) => !isSubscriptionInfoNodeName(name)),
    );
  } catch {
    return undefined;
  }
}
