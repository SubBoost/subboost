import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { resolveHostnameByDoh } from "./doh-resolver";
import { isBenchmarkReservedIp } from "./ssrf-ip";

const MAX_HOST_ENTRIES = 512;
const MAX_DNS_LOOKUPS = 128;
const MAX_HOST_VALUES = 4096;

/** Resolve domain aliases during a normal source refresh; never alter proxy server fields. */
export async function resolveSourceHosts(
  config: Record<string, unknown> | undefined,
  lookup?: (name: string) => Promise<string[]>,
): Promise<Record<string, string[]>> {
  const hosts = config?.hosts;
  if (!hosts || typeof hosts !== "object" || Array.isArray(hosts)) return {};
  const entries = Object.entries(hosts as Record<string, unknown>).slice(0, MAX_HOST_ENTRIES);
  const result: Record<string, string[]> = {};
  const pending = new Map<string, Promise<string[]>>();
  const deadline = Date.now() + 10000;
  let visitedValues = 0;
  const resolve = lookup ?? (async (name: string) => {
    const resolver = new Resolver({ timeout: 3000, tries: 1 });
    const ipv4 = await resolver.resolve4(name).catch(() => []);
    if (ipv4.length && !ipv4.some(isBenchmarkReservedIp)) return ipv4;
    // A desktop TUN may answer system DNS with fake-IP addresses. Do not export
    // those addresses as real proxy entries; recheck using the existing DoH path.
    const verified = await resolveHostnameByDoh(name, { timeoutMs: 3000 }).catch(() => []);
    if (verified.length) return verified.filter(ip => !isBenchmarkReservedIp(ip) && !ip.toLowerCase().startsWith("fdfe:dcba:9876:"));
    return (await resolver.resolve6(name).catch(() => [])).filter(ip => !ip.toLowerCase().startsWith("fdfe:dcba:9876:"));
  });
  const visit = async (value: unknown, seen: Set<string>, depth = 0): Promise<string[]> => {
    if (++visitedValues > MAX_HOST_VALUES || depth > 32 || Date.now() >= deadline) return [];
    if (Array.isArray(value)) {
      const addresses: string[] = [];
      for (const item of value) {
        if (visitedValues >= MAX_HOST_VALUES || Date.now() >= deadline) break;
        addresses.push(...await visit(item, new Set(seen), depth + 1));
      }
      return addresses;
    }
    if (typeof value !== "string" || !value.trim()) return [];
    const name = value.trim();
    if (isIP(name)) return [name];
    if (seen.has(name) || seen.size > 32) return [];
    seen.add(name);
    if (Object.prototype.hasOwnProperty.call(hosts, name)) return visit((hosts as Record<string, unknown>)[name], seen, depth + 1);
    if (!pending.has(name)) {
      if (pending.size >= MAX_DNS_LOOKUPS) return [];
      pending.set(name, resolve(name).catch(() => []));
    }
    return pending.get(name)!;
  };
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (index < entries.length) {
      const [name, target] = entries[index++];
      const ips = [...new Set((await visit(target, new Set([name]))).filter(ip => Boolean(isIP(ip))))];
      if (ips.length) result[name] = ips;
    }
  }));
  return result;
}
