function validServer(value: unknown): boolean {
  return typeof value === "string" && Boolean(value.trim());
}

function validPort(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function isValidMieruPortRange(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{1,5})-(\d{1,5})$/.exec(value);
  return Boolean(match && validPort(Number(match[1])) && validPort(Number(match[2])) && Number(match[1]) <= Number(match[2]));
}

export function buildNodeEndpointKey(node: Record<string, unknown>): string {
  if (node.type === "wireguard" || node.type === "mieru" || node.server === undefined || node.port === undefined) {
    return stableJsonStringify({ type: node.type, server: node.server, port: node.port, peers: node.peers, "port-range": node["port-range"] });
  }
  return `${node.server}-${node.port}`;
}

/** Endpoint shape only; protocol keys and transport options have separate owners. */
export function getNodeEndpointError(node: Record<string, unknown>): string | null {
  const type = typeof node.type === "string" ? node.type.trim().toLowerCase() : "";
  if (["direct", "dns", "reject", "relay"].includes(type)) return null;
  if (type === "wireguard" && node.peers !== undefined) {
    if (!Array.isArray(node.peers) || node.peers.length === 0) return "WireGuard peers 必须是非空数组";
    for (let index = 0; index < node.peers.length; index += 1) {
      const peer = node.peers[index];
      if (!peer || typeof peer !== "object" || Array.isArray(peer)) return `WireGuard peer #${index + 1} 必须是对象`;
      if (!validServer(peer.server) || !validPort(peer.port) || !validServer(peer["public-key"])) {
        return `WireGuard peer #${index + 1} 缺少有效 server、port 或 public-key`;
      }
    }
    if (node.server === undefined && node.port === undefined) return null;
  }
  if (!validServer(node.server)) return "缺少有效服务器地址";
  if (type === "mieru" && node["port-range"] !== undefined) {
    if (node.port !== undefined) return "Mieru port 与 port-range 不能同时设置";
    return isValidMieruPortRange(node["port-range"]) ? null : "Mieru port-range 必须是 1 到 65535 内的递增范围";
  }
  return validPort(node.port) ? null : "端口必须是 1 到 65535 的整数";
}
import { stableJsonStringify } from "./node-identity";
