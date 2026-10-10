import type { ParsedNode } from "../types/node";
import { getNodeOriginName, getNodeSourceIds } from "../subscription/node-source-state";

export interface SourceClashConfig { id: string; config: Record<string, unknown>; resolvedHosts?: Record<string, string[]> }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Subscription order resolves collisions; explicit SubBoost settings take precedence.
function merge(left: unknown, right: unknown): unknown {
  if (record(left) && record(right)) {
    const out = structuredClone(left);
    for (const [key, value] of Object.entries(right)) out[key] = key in out ? merge(out[key], value) : structuredClone(value);
    return out;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const seen = new Set<string>();
    return [...left, ...right].filter(value => { const key = JSON.stringify(value); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  return structuredClone(right);
}

export function mergeSourceClashConfigs(generated: Record<string, unknown>, sources: SourceClashConfig[], nodes: ParsedNode[]): Record<string, unknown> {
  if (!sources.length) return generated;
  let base: Record<string, unknown> = {};
  const groups: Record<string, unknown>[] = [];
  const sourceEntrypoints: string[] = [];
  const importedRules: string[] = [];
  const proxyProviders: Record<string, unknown> = {};
  const ruleProviders: Record<string, unknown> = {};
  const dnsSelfAddresses = new Set<string>();
  const occupied = new Set([
    ...nodes.map(node => node.name),
    ...(Array.isArray(generated["proxy-groups"]) ? generated["proxy-groups"].filter(record).map(group => String(group.name)) : []),
  ]);

  for (const source of sources) {
    const config = source.config;
    const prefix = `source:${source.id}:`;
    const unique = (name: string) => {
      let candidate = prefix + name;
      let suffix = 1;
      while (occupied.has(candidate)) candidate = prefix + name + ` (${++suffix})`;
      occupied.add(candidate);
      return candidate;
    };
    const nodeNames = new Map<string, string>();
    for (const node of nodes) if (getNodeSourceIds(node).includes(source.id)) nodeNames.set(getNodeOriginName(node), node.name);
    const rawGroups = Array.isArray(config["proxy-groups"]) ? config["proxy-groups"].filter(record) : [];
    const groupNames = new Map(rawGroups.filter(group => typeof group.name === "string").map(group => [String(group.name), unique(String(group.name))]));
    const entrypoint = rawGroups.find(group => typeof group.name === "string");
    if (entrypoint) sourceEntrypoints.push(groupNames.get(String(entrypoint.name))!);
    const proxyNames = new Map(Object.keys(record(config["proxy-providers"]) ? config["proxy-providers"] : {}).map(name => [name, prefix + name]));
    const ruleNames = new Map(Object.keys(record(config["rule-providers"]) ? config["rule-providers"] : {}).map(name => [name, prefix + name]));
    const builtins = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE"]);
    const policy = (name: string) => builtins.has(name) ? name : groupNames.get(name) ?? nodeNames.get(name);

    for (const [key, names, target] of [["proxy-providers", proxyNames, proxyProviders], ["rule-providers", ruleNames, ruleProviders]] as const) {
      const providers = config[key];
      if (!record(providers)) continue;
      for (const [name, value] of Object.entries(providers)) {
        const next = record(value) ? { ...value } : value;
        if (record(next)) {
          if (typeof next.proxy === "string") next.proxy = policy(next.proxy) ?? "DIRECT";
          if (next.type === "http") {
            const extension = next.format === "mrs" ? "mrs" : "yaml";
            next.path = `./source_providers/${source.id.replace(/[^a-zA-Z0-9_-]/g, "_")}_${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.${extension}`;
          }
        }
        target[names.get(name)!] = next;
      }
    }
    for (const group of rawGroups) {
      if (typeof group.name !== "string") continue;
      const entries = Array.isArray(group.proxies) ? group.proxies.filter((name): name is string => typeof name === "string").map(policy).filter((name): name is string => Boolean(name)) : [];
      const use = Array.isArray(group.use) ? group.use.filter((name): name is string => typeof name === "string").map(name => proxyNames.get(name)).filter((name): name is string => Boolean(name)) : [];
      if (group["include-all-proxies"] === true) entries.push(...nodeNames.values());
      if (group["include-all-providers"] === true) use.push(...proxyNames.values());
      const next: Record<string, unknown> = { ...group, name: groupNames.get(group.name), proxies: [...new Set(entries.length || use.length ? entries : ["DIRECT"])], ...(use.length ? { use: [...new Set(use)] } : {}) };
      delete next["include-all-proxies"];
      delete next["include-all-providers"];
      groups.push(next);
    }
    for (const rule of Array.isArray(config.rules) ? config.rules : []) {
      if (typeof rule !== "string") continue;
      const parts = rule.split(",");
      if (["MATCH", "FINAL"].includes(parts[0])) continue; // Only one final catch-all can be active.
      const targetIndex = parts.length - (parts.at(-1) === "no-resolve" ? 2 : 1);
      const destination = policy(parts[targetIndex]);
      if (!destination) continue;
      parts[targetIndex] = destination;
      if (parts[0] === "RULE-SET") {
        const provider = ruleNames.get(parts[1]);
        if (!provider) continue;
        parts[1] = provider;
      }
      importedRules.push(parts.join(","));
    }
    if (record(config.dns) && typeof config.dns.listen === "string") {
      const listener = config.dns.listen.replace(/^0\.0\.0\.0:/, "127.0.0.1:");
      dnsSelfAddresses.add("udp://" + listener);
    }
    const metadata = Object.fromEntries(Object.entries(config).filter(([key]) => !["proxies", "proxy-groups", "rules", "proxy-providers", "rule-providers"].includes(key)));
    if (Array.isArray(metadata.listeners)) {
      metadata.listeners = metadata.listeners.map(listener => record(listener) && typeof listener.proxy === "string"
        ? { ...listener, proxy: policy(listener.proxy) ?? "DIRECT" } : listener);
    }
    base = merge(metadata, base) as Record<string, unknown>;
  }
  const result = merge(base, generated) as Record<string, unknown>;
  // Keep original aliases in the snapshot, but export IP hosts entries so clients do
  // not need a separate domain-alias resolver or rely on a rewritten DNS section.
  if (record(result.hosts)) {
    for (const source of [...sources].reverse()) {
      const originalHosts = record(source.config.hosts) ? source.config.hosts : {};
      for (const [name, addresses] of Object.entries(source.resolvedHosts ?? {})) {
        if (addresses.length && JSON.stringify(result.hosts[name]) === JSON.stringify(originalHosts[name])) {
          result.hosts[name] = addresses;
        }
        // A client parser may restore the original domain alias. Also close the
        // alias chain with an IP entry, which Mihomo's outbound resolver follows
        // independently of the client's DNS settings.
        let target = originalHosts[name];
        const visited = new Set([name]);
        while (typeof target === "string" && !target.includes(":") && !/^\d+\.\d+\.\d+\.\d+$/.test(target) && !visited.has(target)) {
          visited.add(target);
          const next = originalHosts[target];
          if (next !== undefined) { target = next; continue; }
          if (addresses.length && result.hosts[target] === undefined) result.hosts[target] = addresses;
          break;
        }
      }
    }
  }
  if (record(result.hosts) && Object.keys(result.hosts).length && record(result.dns)) result.dns["use-hosts"] = true;
  // Original configurations can refer to their own DNS port. The merged config has one listener.
  if (record(result.dns) && Array.isArray(result.dns["proxy-server-nameserver"])) {
    const dns = result.dns;
    const listen = typeof dns.listen === "string" ? dns.listen.replace(/^0\.0\.0\.0:/, "127.0.0.1:") : undefined;
    result.dns["proxy-server-nameserver"] = result.dns["proxy-server-nameserver"].flatMap(server => {
      if (typeof server !== "string" || !dnsSelfAddresses.has(server)) return [server];
      return listen ? ["udp://" + listen] : Array.isArray(dns.nameserver) ? dns.nameserver : [];
    });
  }
  if (Object.keys(proxyProviders).length) result["proxy-providers"] = { ...proxyProviders, ...(record(result["proxy-providers"]) ? result["proxy-providers"] : {}) };
  if (Object.keys(ruleProviders).length) result["rule-providers"] = { ...ruleProviders, ...(record(result["rule-providers"]) ? result["rule-providers"] : {}) };
  result["proxy-groups"] = [...(Array.isArray(generated["proxy-groups"]) ? generated["proxy-groups"].map(group => {
    if (!record(group) || group.type !== "select") return group;
    return { ...group, proxies: [...new Set([...(Array.isArray(group.proxies) ? group.proxies : []), ...sourceEntrypoints])] };
  }) : []), ...groups];
  const rules = Array.isArray(generated.rules) ? generated.rules : [];
  const catchAll = rules.findIndex(rule => typeof rule === "string" && /^(MATCH|FINAL),/.test(rule));
  const split = catchAll < 0 ? rules.length : catchAll;
  result.rules = [...new Set([...rules.slice(0, split), ...importedRules, ...rules.slice(split)])];
  return result;
}
