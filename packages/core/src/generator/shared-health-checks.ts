import { canonicalizeProxy } from "./yaml";

type Mapping = Record<string, unknown>;
const isMapping = (value: unknown): value is Mapping => !!value && typeof value === "object" && !Array.isArray(value);

/** Share only eager probes with identical settings and ordered membership. */
export function shareHealthChecks(config: Mapping): Mapping {
  const nodes = Array.isArray(config.proxies) ? config.proxies.filter(isMapping) : [];
  const groups = Array.isArray(config["proxy-groups"]) ? config["proxy-groups"].filter(isMapping) : [];
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const existing = isMapping(config["proxy-providers"]) ? config["proxy-providers"] : {};
  const usedNames = new Set([...Object.keys(existing), ...nodes.map((n) => n.name), ...groups.map((g) => g.name)]);
  const cohorts = new Map<string, { groups: Mapping[]; members: string[]; health: Mapping }>();
  for (const group of groups) {
    if (group.type !== "url-test" || group.lazy !== false || typeof group.url !== "string") continue;
    if (["use", "filter", "exclude-filter", "exclude-type", "include-all", "include-all-proxies", "include-all-providers"]
      .some((key) => group[key] !== undefined)) continue;
    const members = group.proxies;
    if (!Array.isArray(members) || !members.length || new Set(members).size !== members.length ||
      members.some((name) => typeof name !== "string" || !byName.has(name))) continue;
    if (typeof group.interval !== "number" || !Number.isInteger(group.interval) || group.interval < 0) continue;
    const health: Mapping = {
      enable: true, url: group.url, interval: group.interval || 300,
      timeout: group.timeout ?? 5000, lazy: false,
      ...(group["expected-status"] !== undefined ? { "expected-status": group["expected-status"] } : {}),
    };
    const key = JSON.stringify([members, health]);
    const cohort = cohorts.get(key) ?? { groups: [] as Mapping[], members: members as string[], health };
    cohort.groups.push(group);
    cohorts.set(key, cohort);
  }
  const replacements = new Map<Mapping, Mapping>();
  const providers: Mapping = { ...existing };
  let nextId = 1;
  for (const { groups: matching, members, health } of cohorts.values()) {
    if (matching.length < 2) continue;
    let name: string;
    do { name = `subboost_shared_${nextId++}`; } while (usedNames.has(name));
    usedNames.add(name);
    providers[name] = {
      type: "inline", payload: members.map((member) => canonicalizeProxy(byName.get(member)!)),
      "health-check": health,
    };
    for (const group of matching) {
      const replacement: Mapping = { ...group, use: [name] };
      delete replacement.proxies;
      replacements.set(group, replacement);
    }
  }
  if (!replacements.size) return config;
  return { ...config, "proxy-providers": providers, "proxy-groups": groups.map((group) => replacements.get(group) ?? group) };
}
