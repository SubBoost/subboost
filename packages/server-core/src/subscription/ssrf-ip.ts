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

type Ipv6CidrRule = {
  base: string;
  mask: number;
  unsafe: boolean;
};

// Ordered from the most-specific globally reachable exceptions to their
// enclosing special-purpose ranges. Keep this table aligned with the IANA
// IPv6 Special-Purpose Address Registry.
const IPV6_SPECIAL_PURPOSE_RULES: readonly Ipv6CidrRule[] = [
  { base: "2001:1::1", mask: 128, unsafe: false },
  { base: "2001:1::2", mask: 128, unsafe: false },
  { base: "2001:1::3", mask: 128, unsafe: false },
  { base: "2001:3::", mask: 32, unsafe: false },
  { base: "2001:4:112::", mask: 48, unsafe: false },
  { base: "2001:20::", mask: 28, unsafe: false },
  { base: "2001:30::", mask: 28, unsafe: false },
  { base: "::", mask: 128, unsafe: true },
  { base: "::1", mask: 128, unsafe: true },
  { base: "64:ff9b:1::", mask: 48, unsafe: true },
  { base: "100::", mask: 64, unsafe: true },
  { base: "100:0:0:1::", mask: 64, unsafe: true },
  { base: "2001::", mask: 23, unsafe: true },
  { base: "2001:db8::", mask: 32, unsafe: true },
  { base: "3fff::", mask: 20, unsafe: true },
  { base: "5f00::", mask: 16, unsafe: true },
  { base: "fc00::", mask: 7, unsafe: true },
  { base: "fe80::", mask: 10, unsafe: true },
  { base: "ff00::", mask: 8, unsafe: true },
];

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

function ipv6InCidr(hextets: readonly number[], base: string, maskBits: number): boolean {
  const baseHextets = expandIpv6Hextets(base);
  if (!baseHextets) return false;
  const fullHextets = Math.floor(maskBits / 16);
  for (let index = 0; index < fullHextets; index += 1) {
    if (hextets[index] !== baseHextets[index]) return false;
  }
  const remainingBits = maskBits % 16;
  if (remainingBits === 0) return true;
  const mask = (0xffff << (16 - remainingBits)) & 0xffff;
  return (hextets[fullHextets] & mask) === (baseHextets[fullHextets] & mask);
}

function classifySpecialPurposeIpv6(hextets: readonly number[]): boolean | null {
  for (const rule of IPV6_SPECIAL_PURPOSE_RULES) {
    if (ipv6InCidr(hextets, rule.base, rule.mask)) return rule.unsafe;
  }
  return null;
}

function extractEmbeddedIpv4(hextets: readonly number[]): string | null {
  const isIpv4Compatible = hextets.slice(0, 6).every((part) => part === 0);
  const isIpv4Mapped = hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff;
  const isWellKnownNat64 = hextets[0] === 0x0064 && hextets[1] === 0xff9b && hextets[2] === 0;
  if (isIpv4Compatible || isIpv4Mapped || isWellKnownNat64) {
    return ipv4FromHextets(hextets[6], hextets[7]);
  }

  // RFC 6052 /48 form: v4[0..15] occupies bits 48..63, the u octet
  // at bits 64..71 is zero, and v4[16..31] occupies bits 72..87.
  const isLocalUseNat64 = hextets[0] === 0x0064 && hextets[1] === 0xff9b && hextets[2] === 1;
  if (isLocalUseNat64 && (hextets[4] >> 8) === 0) {
    const low = ((hextets[4] & 0xff) << 8) | (hextets[5] >> 8);
    return ipv4FromHextets(hextets[3], low);
  }

  if (hextets[0] === 0x2002) {
    return ipv4FromHextets(hextets[1], hextets[2]);
  }

  return null;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const hextets = expandIpv6Hextets(ip);
  if (!hextets) return true;

  const specialPurpose = classifySpecialPurposeIpv6(hextets);
  if (specialPurpose !== null) return specialPurpose;

  const embeddedIpv4 = extractEmbeddedIpv4(hextets);
  if (embeddedIpv4) return isPrivateOrReservedIPv4(embeddedIpv4);

  // IANA currently assigns globally routable IPv6 unicast space from
  // 2000::/3. Other unicast blocks are reserved and must not be SSRF targets.
  return !ipv6InCidr(hextets, "2000::", 3);
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
