import { describe, expect, it } from "vitest";
import {
  isMihomoSupportedProxyNode,
  isStandardBase64String,
  normalizeMihomoVlessForGeneration,
  sanitizeMihomoProxyNode,
} from "./proxy-sanitizer";

const REALITY_PUBLIC_KEY = "A".repeat(43);
const WIREGUARD_KEY = `${"A".repeat(43)}=`;
const PRIVATE_KEY = ["-----BEGIN OPENSSH ", "PRIVATE ", "KEY-----\nabc\n-----END OPENSSH ", "PRIVATE ", "KEY-----"].join("");

describe("Mihomo proxy sanitizer boundaries", () => {
  it("covers sanitizer boundary aliases and optional protocol fallbacks", () => {
    const ecdsaSsh = sanitizeMihomoProxyNode({
      name: "SSH",
      type: "ssh",
      server: "ssh.example.com",
      port: 22,
      password: "secret",
      "host-key": [
        "ssh-ecdsa-nistp256 AAAAC3NzaC1lZDI1NTE5AAAAIA==",
        "ssh-ecdsa-!bad AAAAC3NzaC1lZDI1NTE5AAAAIA==",
        "ssh-rsa bad!token",
      ],
    });
    const certless = sanitizeMihomoProxyNode({
      name: "HTTP",
      type: "http",
      server: "http.example.com",
      port: 80,
      fingerprint: 1,
    });
    const clientFingerprintAlreadySet = sanitizeMihomoProxyNode({
      name: "Trojan",
      type: "trojan",
      server: "trojan.example.com",
      port: 443,
      password: "secret",
      fingerprint: "Chrome",
      "client-fingerprint": "safari",
    });
    const wireguardReservedArray = sanitizeMihomoProxyNode({
      name: "WG",
      type: "wireguard",
      server: "wg.example.com",
      port: 51820,
      "private-key": WIREGUARD_KEY,
      reserved: [1, "2", 3],
    });
    const xhttpNoReality = normalizeMihomoVlessForGeneration({
      name: "XHTTP",
      type: "vless",
      uuid: "11111111-1111-4111-8111-111111111111",
      network: "xhttp",
      "xhttp-opts": {
        "download-settings": {
          "ech-opts": {
            enable: false,
            config: Buffer.from("ech").toString("base64"),
            "query-server-name": " ech.example.com ",
          },
        },
      },
    });

    expect(ecdsaSsh).toMatchObject({
      "host-key": ["ssh-ecdsa-nistp256 AAAAC3NzaC1lZDI1NTE5AAAAIA=="],
    });
    expect(certless).not.toHaveProperty("fingerprint");
    expect(clientFingerprintAlreadySet).toMatchObject({ "client-fingerprint": "safari" });
    expect(clientFingerprintAlreadySet).not.toHaveProperty("fingerprint");
    expect(wireguardReservedArray).toHaveProperty("reserved", [1, 2, 3]);
    expect(xhttpNoReality).toMatchObject({
      "xhttp-opts": {
        "download-settings": {
          "ech-opts": {
            enable: false,
            config: Buffer.from("ech").toString("base64"),
            "query-server-name": "ech.example.com",
          },
        },
      },
    });
    expect(
      isMihomoSupportedProxyNode({
        type: "trojan",
        name: "Trojan",
        server: "trojan.example.com",
        port: 443,
        password: "secret",
      })
    ).toBe(true);
    expect(
      isMihomoSupportedProxyNode({
        type: "ss",
        name: "SS",
        server: "ss.example.com",
        port: 8388,
        cipher: "aes-128-gcm",
        password: "secret",
        plugin: "v2ray-plugin",
      })
    ).toBe(true);
  });

  it("rejects explicit malformed optional transport fields", () => {
    const ssh = sanitizeMihomoProxyNode({
      name: "SSH",
      type: "ssh",
      server: "ssh.example.com",
      port: 22,
      password: "secret",
      "host-key": [
        "ssh-rsa AAAA",
        "ssh-dss AAAA comment",
        "ssh-ed25519",
        "ssh-ecdsa-!bad AAAA",
      ],
    });
    const invalidReserved = sanitizeMihomoProxyNode({
      name: "WG",
      type: "wireguard",
      server: "wg.example.com",
      port: 51820,
      "private-key": WIREGUARD_KEY,
      reserved: "1,2",
    });
    const explicitEmptyDownloadReality = normalizeMihomoVlessForGeneration({
      name: "XHTTP",
      type: "vless",
      uuid: "11111111-1111-4111-8111-111111111111",
      network: "xhttp",
      "reality-opts": {
        "public-key": REALITY_PUBLIC_KEY,
      },
      "xhttp-opts": {
        "download-settings": {
          "reality-opts": {
            "public-key": "",
          },
        },
      },
    });
    const invalidDownloadReality = normalizeMihomoVlessForGeneration({
      name: "XHTTP",
      type: "vless",
      uuid: "11111111-1111-4111-8111-111111111111",
      network: "xhttp",
      "reality-opts": {
        "public-key": REALITY_PUBLIC_KEY,
      },
      "xhttp-opts": {
        "download-settings": {
          "reality-opts": {
            "public-key": "bad",
          },
        },
      },
    });
    const invalidMainReality = normalizeMihomoVlessForGeneration({
      name: "Reality",
      type: "vless",
      uuid: "11111111-1111-4111-8111-111111111111",
      "reality-opts": "bad",
    });
    const prefixedCertificate = sanitizeMihomoProxyNode({
      name: "HTTPS",
      type: "https",
      server: "https.example.com",
      port: 443,
      fingerprint: "SHA256=" + "C".repeat(64).match(/.{1,2}/g)?.join(":"),
    });

    expect(isMihomoSupportedProxyNode({ type: "ss", cipher: "", password: "secret" })).toBe(false);
    expect(
      isMihomoSupportedProxyNode({
        type: "vless",
        uuid: "11111111-1111-4111-8111-111111111111",
        network: "xhttp",
        "reality-opts": {
          "public-key": REALITY_PUBLIC_KEY,
        },
        "xhttp-opts": {
          "download-settings": {
            "reality-opts": {
              "public-key": "bad",
            },
          },
        },
      })
    ).toBe(false);
    expect(ssh).toMatchObject({ "host-key": ["ssh-rsa AAAA", "ssh-dss AAAA comment"] });
    expect(invalidReserved).not.toHaveProperty("reserved");
    expect(explicitEmptyDownloadReality).toMatchObject({
      "xhttp-opts": {
        "download-settings": {
          "reality-opts": {
            "public-key": "",
          },
        },
      },
    });
    expect(invalidDownloadReality).toHaveProperty("_subboost-invalid-mihomo-node", true);
    expect(invalidMainReality).toHaveProperty("_subboost-invalid-mihomo-node", true);
    expect(prefixedCertificate).toHaveProperty("fingerprint", "c".repeat(64));
  });

  it("covers conservative sanitizer fallbacks for omitted and malformed optional fields", () => {
    const sshWithScalarHostKey = sanitizeMihomoProxyNode({
      name: "SSH",
      type: "ssh",
      server: "ssh.example.com",
      port: 22,
      password: "secret",
      "host-key": "ssh-rsa AAAA",
      "private-key": undefined,
      "server-fingerprint": 1,
    });
    const sshWithEmptyHostKeyMaterial = sanitizeMihomoProxyNode({
      name: "SSH",
      type: "ssh",
      server: "ssh.example.com",
      port: 22,
      password: "secret",
      "host-key": ["ssh-rsa ", "ssh-ecdsa- AAAA", "ssh-ed25519 AAAA"],
    });
    const wireguardWithUndefinedOptionalKeys = sanitizeMihomoProxyNode({
      name: "WG",
      type: "wireguard",
      server: "wg.example.com",
      port: 51820,
      "private-key": WIREGUARD_KEY,
      "public-key": undefined,
      "pre-shared-key": undefined,
      reserved: "",
    });
    const plainHttp = sanitizeMihomoProxyNode({
      name: "HTTP",
      type: "http",
      server: "http.example.com",
      port: 80,
      udp: "TRUE",
      tls: "FALSE",
      alpn: [],
      fingerprint: "Not-A-Known-Alias",
      "ws-opts": {},
    });
    const vlessWithoutReality = sanitizeMihomoProxyNode({
      name: "VLESS",
      type: "vless",
      server: "vless.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      network: "xhttp",
      "xhttp-opts": {
        "download-settings": {
          "reality-opts": {
            "public-key": REALITY_PUBLIC_KEY,
            "short-id": "not-hex",
          },
          "ech-opts": {
            enable: "0",
            config: "",
            "query-server-name": " ",
          },
        },
      },
    });

    expect(sshWithScalarHostKey).not.toHaveProperty("host-key");
    expect(sshWithScalarHostKey).not.toHaveProperty("private-key");
    expect(sshWithScalarHostKey).not.toHaveProperty("server-fingerprint");
    expect(sshWithEmptyHostKeyMaterial).toHaveProperty("host-key", ["ssh-ed25519 AAAA"]);
    expect(wireguardWithUndefinedOptionalKeys).toMatchObject({
      "private-key": WIREGUARD_KEY,
    });
    expect(wireguardWithUndefinedOptionalKeys).not.toHaveProperty("public-key");
    expect(wireguardWithUndefinedOptionalKeys).not.toHaveProperty("pre-shared-key");
    expect(wireguardWithUndefinedOptionalKeys).not.toHaveProperty("reserved");
    expect(plainHttp).toMatchObject({ udp: true, tls: false });
    expect(plainHttp).not.toHaveProperty("alpn");
    expect(plainHttp).not.toHaveProperty("fingerprint");
    expect(plainHttp).not.toHaveProperty("ws-opts");
    expect(vlessWithoutReality).toMatchObject({
      "xhttp-opts": {
        "download-settings": {
          "reality-opts": {
            "public-key": REALITY_PUBLIC_KEY,
          },
          "ech-opts": {
            enable: false,
          },
        },
      },
    });
    expect(
      (vlessWithoutReality["xhttp-opts"] as Record<string, Record<string, unknown>>)["download-settings"][
        "reality-opts"
      ]
    ).not.toHaveProperty("short-id");
    expect(
      (vlessWithoutReality["xhttp-opts"] as Record<string, Record<string, unknown>>)["download-settings"]["ech-opts"]
    ).not.toHaveProperty("config");
    expect(
      (vlessWithoutReality["xhttp-opts"] as Record<string, Record<string, unknown>>)["download-settings"]["ech-opts"]
    ).not.toHaveProperty("query-server-name");

    expect(isMihomoSupportedProxyNode({ type: "http", name: "HTTP" })).toBe(true);
    expect(
      isMihomoSupportedProxyNode({
        type: "wireguard",
        name: "WG",
        server: "wg.example.com",
        port: 51820,
        "private-key": WIREGUARD_KEY,
        "public-key": undefined,
        "pre-shared-key": WIREGUARD_KEY,
      })
    ).toBe(true);
    expect(
      isMihomoSupportedProxyNode({
        type: "ssh",
        name: "SSH",
        server: "ssh.example.com",
        port: 22,
        "private-key": "bad",
      })
    ).toBe(false);
    expect(
      isMihomoSupportedProxyNode({
        type: "ssh",
        name: "SSH",
        server: "ssh.example.com",
        port: 22,
        "private-key": PRIVATE_KEY,
      })
    ).toBe(true);
    expect(
      isMihomoSupportedProxyNode({
        type: "ss",
        name: "SS",
        server: "ss.example.com",
        port: 8388,
        cipher: "aes-128-gcm",
        password: "secret",
        plugin: "simple-obfs",
      })
    ).toBe(true);
  });

  it("covers remaining protocol support and cleanup fallbacks", () => {
    expect(isStandardBase64String("abcd!")).toBe(false);
    expect(
      isMihomoSupportedProxyNode({
        type: "ssr",
        name: "SSR",
        server: "ssr.example.com",
        port: 8388,
        cipher: "aes-128-gcm",
        password: "secret",
        protocol: "",
        obfs: "plain",
      })
    ).toBe(false);
    expect(
      isMihomoSupportedProxyNode({
        type: "vless",
        name: "XHTTP",
        server: "vless.example.com",
        port: 443,
        uuid: "11111111-1111-4111-8111-111111111111",
        network: "xhttp",
        "reality-opts": { "public-key": REALITY_PUBLIC_KEY },
        "xhttp-opts": {
          mode: "stream-one",
          "download-settings": {
            path: "/download",
          },
        },
      })
    ).toBe(false);
    expect(
      isMihomoSupportedProxyNode({
        type: "vless",
        name: "XHTTP",
        server: "vless.example.com",
        port: 443,
        uuid: "11111111-1111-4111-8111-111111111111",
        network: "xhttp",
        "reality-opts": { "public-key": REALITY_PUBLIC_KEY },
        "xhttp-opts": {
          "download-settings": {
            "reality-opts": {
              "public-key": "",
            },
          },
        },
      })
    ).toBe(true);

    const invalidContainers = sanitizeMihomoProxyNode({
      name: "Containers",
      type: "vmess",
      server: "vmess.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      ech: "bad",
      alpn: 443,
      "ech-opts": [],
      "ws-opts": {},
      fingerprint: "unknown",
    });
    const sshWithoutHostKey = sanitizeMihomoProxyNode({
      name: "SSH",
      type: "ssh",
      server: "ssh.example.com",
      port: 22,
      password: "secret",
      "host-key": "ssh-ed25519 AAAA",
      "server-fingerprint": `SHA256:${"B".repeat(43)}=`,
    });
    const wireguardMissingReserved = sanitizeMihomoProxyNode({
      name: "WG",
      type: "wireguard",
      server: "wg.example.com",
      port: 51820,
      "private-key": WIREGUARD_KEY,
      reserved: "1,2",
    });
    const noRealityDownloadSettings = normalizeMihomoVlessForGeneration({
      name: "XHTTP",
      type: "vless",
      uuid: "11111111-1111-4111-8111-111111111111",
      network: "xhttp",
      "xhttp-opts": {
        "download-settings": {
          path: "/download",
        },
      },
    });
    const invalidDownloadReality = normalizeMihomoVlessForGeneration({
      name: "XHTTP",
      type: "vless",
      uuid: "11111111-1111-4111-8111-111111111111",
      network: "xhttp",
      "xhttp-opts": {
        "download-settings": {
          "reality-opts": {
            "public-key": "bad",
          },
        },
      },
    });
    const explicitTlsReality = normalizeMihomoVlessForGeneration({
      name: "Reality",
      type: "vless",
      uuid: "11111111-1111-4111-8111-111111111111",
      tls: true,
      "client-fingerprint": "edge",
      "reality-opts": {
        "public-key": REALITY_PUBLIC_KEY,
      },
    });
    const noEncryption = sanitizeMihomoProxyNode({
      name: "VLESS",
      type: "vless",
      server: "vless.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      encryption: " ",
    });

    expect(invalidContainers).not.toHaveProperty("alpn");
    expect(invalidContainers).not.toHaveProperty("ech-opts");
    expect(invalidContainers).not.toHaveProperty("fingerprint");
    expect(invalidContainers).not.toHaveProperty("ws-opts");
    expect(sshWithoutHostKey).not.toHaveProperty("host-key");
    expect(sshWithoutHostKey).toHaveProperty("server-fingerprint", `SHA256:${"B".repeat(43)}=`);
    expect(wireguardMissingReserved).not.toHaveProperty("reserved");
    expect(noRealityDownloadSettings).toMatchObject({
      "xhttp-opts": {
        "download-settings": {
          path: "/download",
        },
      },
    });
    expect(invalidDownloadReality).toHaveProperty("_subboost-invalid-mihomo-node", true);
    expect(explicitTlsReality).toMatchObject({
      tls: true,
      "client-fingerprint": "edge",
    });
    expect(noEncryption).not.toHaveProperty("encryption");
  });
});
