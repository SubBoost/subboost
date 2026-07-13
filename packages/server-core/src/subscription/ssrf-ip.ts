import { isIP } from "node:net";

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;

  return (
    (((nums[0] << 24) >>> 0) +
      ((nums[1] << 16) >>> 0) +
      ((nums[2] << 8) >>> 0) +
      (nums[3] >>> 0)) >>>
    0
  );
}

function ipv4InCidr(ipInt: number, baseInt: number, maskBits: number): boolean {
  const mask = maskBits === 0 ? 0 : ((0xffffffff << (32 - maskBits)) >>> 0);
  return ((ipInt & mask) >>> 0) === ((baseInt & mask) >>> 0);
}

function isPrivateOrReservedIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return true;

  const cidrs: Array<{ base: string; mask: number }> = [
    { base: "0.0.0.0", mask: 8 },
    { base: "10.0.0.0", mask: 8 },
    { base: "100.64.0.0", mask: 10 },
    { base: "127.0.0.0", mask: 8 },
    { base: "169.254.0.0", mask: 16 },
    { base: "172.16.0.0", mask: 12 },
    { base: "192.0.0.0", mask: 24 },
    { base: "192.0.2.0", mask: 24 },
    { base: "192.88.99.0", mask: 24 },
    { base: "192.168.0.0", mask: 16 },
    { base: "198.18.0.0", mask: 15 },
    { base: "198.51.100.0", mask: 24 },
    { base: "203.0.113.0", mask: 24 },
    { base: "224.0.0.0", mask: 4 },
    { base: "240.0.0.0", mask: 4 },
  ];

  for (const cidr of cidrs) {
    const baseInt = ipv4ToInt(cidr.base);
    if (baseInt === null) continue;
    if (ipv4InCidr(ipInt, baseInt, cidr.mask)) return true;
  }

  return false;
}

function isBenchmarkReservedIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt("198.18.0.0");
  if (ipInt === null || baseInt === null) return false;
  return ipv4InCidr(ipInt, baseInt, 15);
}

function ipv4FromHextets(high: number, low: number): string {
  return [
    high >> 8,
    high & 0xff,
    low >> 8,
    low & 0xff,
  ].join(".");
}

function expandIpv6Hextets(ip: string): number[] | null {
  let normalized = ip.toLowerCase();
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4Int = ipv4ToInt(normalized.slice(lastColon + 1));
    if (ipv4Int === null) return null;
    normalized = `${normalized.slice(0, lastColon)}:${((ipv4Int >>> 16) & 0xffff).toString(16)}:${(
      ipv4Int & 0xffff
    ).toString(16)}`;
  }

  const compressionIndex = normalized.indexOf("::");
  if (compressionIndex !== normalized.lastIndexOf("::")) return null;

  const left = (compressionIndex === -1 ? normalized : normalized.slice(0, compressionIndex))
    .split(":")
    .filter(Boolean);
  const right = (compressionIndex === -1 ? "" : normalized.slice(compressionIndex + 2))
    .split(":")
    .filter(Boolean);
  const missing = 8 - left.length - right.length;
  if ((compressionIndex === -1 && missing !== 0) || (compressionIndex !== -1 && missing < 1)) return null;

  const parts = compressionIndex === -1 ? left : [...left, ...Array(missing).fill("0"), ...right];
  const hextets = parts.map((part) => Number.parseInt(part, 16));
  if (hextets.length !== 8 || hextets.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) {
    return null;
  }
  return hextets;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const hextets = expandIpv6Hextets(ip);
  if (!hextets) return true;

  const [first, second] = hextets;
  const allButLastZero = hextets.slice(0, 7).every((part) => part === 0);
  if (hextets.every((part) => part === 0) || (allButLastZero && hextets[7] === 1)) return true;
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  if ((first & 0xff00) === 0xff00) return true;
  if (first === 0x2001 && second === 0x0db8) return true;

  const isIpv4Compatible = hextets.slice(0, 6).every((part) => part === 0);
  const isIpv4Mapped = hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff;
  if (isIpv4Compatible || isIpv4Mapped) {
    return isPrivateOrReservedIPv4(ipv4FromHextets(hextets[6], hextets[7]));
  }

  return false;
}

export function isPrivateOrReservedIp(hostname: string): boolean {
  const version = isIP(hostname);
  if (version === 4) return isPrivateOrReservedIPv4(hostname);
  if (version === 6) return isPrivateOrReservedIPv6(hostname);
  return false;
}

export function isBenchmarkReservedIp(hostname: string): boolean {
  const version = isIP(hostname);
  if (version === 4) return isBenchmarkReservedIPv4(hostname);
  return false;
}

export function normalizeResolvedIpAddresses(addresses: readonly string[]): string[] {
  return addresses
    .map((ip) => (typeof ip === "string" ? ip.trim() : ""))
    .filter(Boolean);
}

export function shouldRecheckFakeIpDnsAnswers(addresses: readonly string[]): boolean {
  const normalized = normalizeResolvedIpAddresses(addresses);
  const unsafe = normalized.filter((ip) => isPrivateOrReservedIp(ip));
  return unsafe.length > 0 && unsafe.every((ip) => isBenchmarkReservedIp(ip));
}

export function selectDnsAddressesAfterFakeIpRecheck(
  systemAddresses: readonly string[],
  recheckAddresses: readonly string[]
): string[] {
  const normalizedSystemAddresses = normalizeResolvedIpAddresses(systemAddresses);
  if (!shouldRecheckFakeIpDnsAnswers(normalizedSystemAddresses)) return normalizedSystemAddresses;

  const normalizedRecheckAddresses = normalizeResolvedIpAddresses(recheckAddresses);
  return normalizedRecheckAddresses.length > 0 ? normalizedRecheckAddresses : normalizedSystemAddresses;
}
