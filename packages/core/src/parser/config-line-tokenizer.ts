import { splitWsPathEarlyData } from "./ws-early-data";

export function parseBooleanish(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/^['"]|['"]$/g, "");
}

export function tokenizeConfigLine(line: string): {
  name: string;
  type: string;
  host: string;
  port: number;
  params: Record<string, string>;
  extras: string[];
} {
  const eqIndex = line.indexOf("=");
  if (eqIndex <= 0) {
    throw new Error("无效的配置行格式");
  }

  const name = stripQuotes(line.slice(0, eqIndex));
  const tokens = line
    .slice(eqIndex + 1)
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length < 3) {
    throw new Error("配置行缺少类型/地址/端口");
  }

  const type = tokens[0].toLowerCase();
  const host = stripQuotes(tokens[1]);
  const portText = stripQuotes(tokens[2]);
  const port = Number(portText);
  if (!host || !/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("配置行中的地址或端口无效");
  }

  const params: Record<string, string> = {};
  const extras: string[] = [];
  for (const token of tokens.slice(3)) {
    const splitIndex = token.indexOf("=");
    if (splitIndex === -1) {
      extras.push(stripQuotes(token));
      continue;
    }
    const key = token.slice(0, splitIndex).trim().toLowerCase();
    const value = stripQuotes(token.slice(splitIndex + 1));
    if (key) {
      params[key] = value;
      const dashed = key.replace(/_/g, "-");
      const underscored = key.replace(/-/g, "_");
      if (!(dashed in params)) params[dashed] = value;
      if (!(underscored in params)) params[underscored] = value;
    }
  }

  return { name, type, host, port, params, extras };
}

export function looksLikeConfigLine(line: string): boolean {
  return /^[^#=\r\n][^=\r\n]*=\s*[a-zA-Z0-9_-]+\s*,/.test(line.trim());
}

export function parseStringList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const list = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

export function parseWsHeaders(value: string | undefined): Record<string, string> | undefined {
  if (!value) return undefined;
  const out: Record<string, string> = {};
  for (const pair of value.split("|")) {
    const idx = pair.indexOf(":");
    if (idx === -1) continue;
    const key = stripQuotes(pair.slice(0, idx)).trim();
    const val = stripQuotes(pair.slice(idx + 1)).trim();
    if (key && val) out[key] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseIntParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function isUuidLike(value: string | undefined): boolean {
  const raw = (value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
}

export function inferSkipCertVerify(params: Record<string, string>): boolean | undefined {
  const direct = parseBooleanish(params["skip-cert-verify"]);
  if (direct !== undefined) return direct;
  const allowInsecure = parseBooleanish(
    params["allow-insecure"] || params["allow_insecure"] || params.allowinsecure || params.insecure
  );
  if (allowInsecure !== undefined) return allowInsecure;
  const tlsVerification = parseBooleanish(params["tls-verification"]);
  return tlsVerification === false ? true : undefined;
}

export function applyCommonNodeParams(node: Record<string, unknown>, params: Record<string, string>) {
  const sni = params.sni || params.peer || params["tls-name"] || params["server-name"] || undefined;
  if (sni) {
    if (node.type === "vmess" || node.type === "vless") {
      node.servername = sni;
    } else {
      node.sni = sni;
    }
  }

  const skipCertVerify = inferSkipCertVerify(params);
  if (skipCertVerify !== undefined) {
    node["skip-cert-verify"] = skipCertVerify;
  }

  const tlsFingerprint =
    params["tls-fingerprint"] ||
    params["server-cert-fingerprint-sha256"] ||
    params["server-fingerprint"] ||
    params.fingerprint ||
    params.fp;
  if (tlsFingerprint) {
    if (node.type === "hysteria2") {
      node.fingerprint = tlsFingerprint;
    } else {
      node["tls-fingerprint"] = tlsFingerprint;
    }
  }

  if (params["tls-cert-sha256"] || params["tls_cert_sha256"]) {
    node["tls-cert-sha256"] = params["tls-cert-sha256"] || params["tls_cert_sha256"];
  }
  if (params["tls-pubkey-sha256"] || params["tls_pubkey_sha256"]) {
    node["tls-pubkey-sha256"] = params["tls-pubkey-sha256"] || params["tls_pubkey_sha256"];
  }

  const disableSni = parseBooleanish(params["disable-sni"] || params["disable_sni"] || params.disablesni);
  if (disableSni !== undefined) {
    node["disable-sni"] = disableSni;
  }

  const blockQuic = parseBooleanish(params["block-quic"] || params.blockquic);
  if (blockQuic !== undefined) {
    node["block-quic"] = blockQuic;
  }

  const udpPort = parseIntParam(params["udp-port"] || params.udpport);
  if (udpPort !== undefined) {
    node["udp-port"] = udpPort;
  }

  const fastOpen = parseBooleanish(params["fast-open"] || params.tfo || params.fastopen);
  if (fastOpen !== undefined) {
    node.tfo = fastOpen;
  }

  const shadowTlsVersion = parseIntParam(params["shadow-tls-version"] || params["shadow_tls_version"]);
  if (shadowTlsVersion !== undefined) node["shadow-tls-version"] = shadowTlsVersion;
  if (params["shadow-tls-sni"]) node["shadow-tls-sni"] = params["shadow-tls-sni"];
  if (params["shadow-tls-password"]) node["shadow-tls-password"] = params["shadow-tls-password"];
}

export function applyTransport(
  node: Record<string, unknown>,
  params: Record<string, string>,
  opts?: { defaultTransport?: string; allowedTransports?: string[]; protocolName?: string }
) {
  const rawTransport =
    params.transport ||
    params.network ||
    params.type ||
    (parseBooleanish(params.ws) ? "ws" : undefined) ||
    opts?.defaultTransport ||
    "tcp";
  const transportRaw = rawTransport.trim().toLowerCase();
  const allowedTransports = opts?.allowedTransports ?? ["tcp", "ws", "httpupgrade", "grpc", "http", "h2"];
  if (!allowedTransports.includes(transportRaw)) {
    throw new Error(
      `不支持的 ${opts?.protocolName || "节点"} 传输层: transport=${transportRaw || "(empty)"}（仅支持 ${allowedTransports.join("/")})`
    );
  }
  const transport = transportRaw === "httpupgrade" ? "ws" : transportRaw;
  const wsHeaders = parseWsHeaders(params["ws-headers"]);
  const wsHost = params["ws-headers"] ? parseWsHeaders(params["ws-headers"])?.Host : undefined;
  const host =
    wsHost ||
    params["transport-host"] ||
    params["ws-host"] ||
    params["obfs-host"] ||
    params.host ||
    undefined;
  const path =
    params["transport-path"] ||
    params["ws-path"] ||
    params["obfs-uri"] ||
    params.wspath ||
    params.path ||
    "/";
  const serviceName =
    params["grpc-service-name"] ||
    params["service-name"] ||
    params["service_name"] ||
    params.servicename ||
    params.path ||
    "";
  const grpcMode = params.mode || undefined;
  const grpcAuthority = params.authority || undefined;
  const xhttpHeaders = parseWsHeaders(params["xhttp-headers"] || params["xhttp_headers"] || params.headers);

  switch (transport) {
    case "ws":
      node.network = "ws";
      const { path: wsPath, earlyData } = splitWsPathEarlyData(path);
      node["ws-opts"] = {
        path: wsPath,
        headers:
          host || wsHeaders
            ? {
                ...(wsHeaders || {}),
                ...(host ? { Host: host } : {}),
              }
            : undefined,
        ...(earlyData !== undefined
          ? {
              "early-data-header-name": "Sec-WebSocket-Protocol",
              "max-early-data": earlyData,
            }
          : {}),
        ...(transportRaw === "httpupgrade"
          ? { "v2ray-http-upgrade": true, "v2ray-http-upgrade-fast-open": true }
          : {}),
      };
      break;
    case "grpc":
      node.network = "grpc";
      node["grpc-opts"] = {
        "grpc-service-name": serviceName.replace(/^\//, ""),
        ...(grpcMode ? { _grpcType: grpcMode } : {}),
        ...(grpcAuthority ? { _grpcAuthority: grpcAuthority } : {}),
      };
      break;
    case "http":
      node.network = "http";
      node["http-opts"] = {
        method: (params.method || "GET").trim().toUpperCase() || "GET",
        path: parseStringList(path) || ["/"],
        headers: host ? { Host: parseStringList(host) || [host] } : undefined,
      };
      break;
    case "h2":
      node.network = "h2";
      node["h2-opts"] = {
        host: parseStringList(host),
        path,
      };
      break;
    case "xhttp": {
      node.network = "xhttp";
      const reuseSettings: Record<string, string> = {};
      const reuseKeys = [
        "max-concurrency",
        "max-connections",
        "c-max-reuse-times",
        "h-max-request-times",
        "h-max-reusable-secs",
      ] as const;
      for (const key of reuseKeys) {
        if (params[key]) reuseSettings[key] = params[key];
      }
      const downloadSettings: Record<string, unknown> = {};
      if (params["download-path"]) downloadSettings.path = params["download-path"];
      if (params["download-host"]) downloadSettings.host = params["download-host"];
      const downloadHeaders = parseWsHeaders(
        params["download-headers"] || params["download_headers"] || params.downloadheaders
      );
      if (downloadHeaders) downloadSettings.headers = downloadHeaders;

      const noGrpcHeader = parseBooleanish(params["no-grpc-header"] || params["no_grpc_header"] || params.nogrpcheader);
      const scMaxEachPostBytes = parseIntParam(params["sc-max-each-post-bytes"] || params["sc_max_each_post_bytes"]);

      node["xhttp-opts"] = {
        path,
        ...(host ? { host } : {}),
        ...(params.mode ? { mode: params.mode } : {}),
        ...(xhttpHeaders ? { headers: xhttpHeaders } : {}),
        ...(noGrpcHeader !== undefined ? { "no-grpc-header": noGrpcHeader } : {}),
        ...(params["x-padding-bytes"] ? { "x-padding-bytes": params["x-padding-bytes"] } : {}),
        ...(scMaxEachPostBytes !== undefined ? { "sc-max-each-post-bytes": scMaxEachPostBytes } : {}),
        ...(Object.keys(reuseSettings).length > 0 ? { "reuse-settings": reuseSettings } : {}),
        ...(Object.keys(downloadSettings).length > 0 ? { "download-settings": downloadSettings } : {}),
      };
      break;
    }
    default:
      node.network = "tcp";
  }
}
