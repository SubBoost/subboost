import { describe, expect, it } from "vitest";
import { parseHttp, parseSimpleProxy, parseSocks, parseSsh, parseTelegramProxyLink } from "./simple-proxy";

describe("simple proxy parsers", () => {
  it("parses HTTP and HTTPS URLs with auth, headers, SNI, and TLS verification aliases", () => {
    const jsonHeaders = encodeURIComponent('{"User-Agent":"SubBoost","X-Test":"yes"}');
    const http = parseHttp(
      "http://user:pass@http.example.com:8080?headers=User-Agent:SubBoost|X-Test:yes&tls-verification=false&sni=edge.example.com#HTTP"
    );
    const httpJson = parseHttp(`http://json.example.com:8080?headers=${jsonHeaders}#JSON`);
    const httpBadJson = parseHttp(
      `http://bad-json.example.com:8080?headers=${encodeURIComponent("[1]")}#BadJSON`
    );
    const https = parseHttp("https://secure.example.com#Secure");
    const colonAuth = parseHttp("http://colon.example.com:8080:user:p%40ss#Colon");
    const headerAlias = parseHttp("http://alias.example.com:8080?header=bad|:skip|X-Empty:&skip_cert_verify=no&peer=peer.example.com");
    const ipv6 = parseHttp("http://[2001:db8::1]:8080#IPv6");
    const ipv6DefaultPort = parseHttp("http://[2001:db8::2]");
    const tlsVerified = parseHttp("http://verified.example.com:8080?tls-verification=true#Verified");

    expect(http).toMatchObject({
      name: "HTTP",
      type: "http",
      server: "http.example.com",
      port: 8080,
      username: "user",
      password: "pass",
      sni: "edge.example.com",
      "skip-cert-verify": true,
      headers: {
        "User-Agent": "SubBoost",
        "X-Test": "yes",
      },
    });
    expect(httpJson).toMatchObject({
      name: "JSON",
      headers: {
        "User-Agent": "SubBoost",
        "X-Test": "yes",
      },
    });
    expect(httpBadJson).not.toHaveProperty("headers");
    expect(https).toMatchObject({
      name: "Secure",
      type: "https",
      server: "secure.example.com",
      port: 443,
      tls: true,
    });
    expect(colonAuth).toMatchObject({
      name: "Colon",
      type: "http",
      server: "colon.example.com",
      port: 8080,
      username: "user",
      password: "p@ss",
    });
    expect(headerAlias).toMatchObject({
      server: "alias.example.com",
      sni: "peer.example.com",
      "skip-cert-verify": false,
      headers: {
        "X-Empty": "",
      },
    });
    expect(ipv6).toMatchObject({
      name: "IPv6",
      server: "2001:db8::1",
      port: 8080,
    });
    expect(ipv6DefaultPort).toMatchObject({
      server: "2001:db8::2",
      port: 80,
    });
    expect(tlsVerified).toMatchObject({
      name: "Verified",
      "skip-cert-verify": false,
    });
  });

  it("parses SOCKS variants including encoded authority and encoded username auth", () => {
    const encodedAuthority = Buffer.from("alice:secret@socks.example.com:1080").toString("base64url");
    const encodedNoAuth = Buffer.from("plain-socks.example.com:1080").toString("base64url");
    const encodedAuth = Buffer.from("bob:secret").toString("base64url");
    const fromAuthority = parseSocks(`socks://${encodedAuthority}?remarks=Encoded`);
    const fromAuthorityNoAuth = parseSocks(`socks://${encodedNoAuth}`);
    const fromUsername = parseSocks(`socks5://${encodedAuth}@socks-auth.example.com:1080#Auth`);
    const tls = parseSocks("socks5+tls://carol:secret@socks-tls.example.com:443?udp=0&sni=socks.example.com#TLS");
    const tlsVerified = parseSocks("socks5://verified-socks.example.com:1080?tls-verification=true#VerifiedSocks");
    const socks4 = parseSocks("socks4://dave@socks4.example.com?udp-relay=yes&allow_insecure=true#S4");
    const defaultName = parseSocks("socks5://socks-default.example.com:1080");
    const controlAuthority = parseSocks(`socks://${Buffer.from("\x00bad").toString("base64url")}#Control`);

    expect(fromAuthority).toMatchObject({
      name: "Encoded",
      type: "socks5",
      server: "socks.example.com",
      port: 1080,
      username: "alice",
      password: "secret",
    });
    expect(fromAuthorityNoAuth).toMatchObject({
      name: "SOCKS-plain-socks.example.com:1080",
      server: "plain-socks.example.com",
      port: 1080,
    });
    expect(fromUsername).toMatchObject({
      name: "Auth",
      username: "bob",
      password: "secret",
    });
    expect(tls).toMatchObject({
      type: "socks5",
      tls: true,
      udp: false,
      sni: "socks.example.com",
    });
    expect(tlsVerified).toMatchObject({
      name: "VerifiedSocks",
      "skip-cert-verify": false,
    });
    expect(socks4).toMatchObject({
      name: "S4",
      type: "socks4",
      server: "socks4.example.com",
      port: 1080,
      username: "dave",
      udp: true,
      "skip-cert-verify": true,
    });
    expect(defaultName).toMatchObject({
      name: "SOCKS-socks-default.example.com:1080",
      type: "socks5",
      server: "socks-default.example.com",
      port: 1080,
    });
    expect(controlAuthority).toMatchObject({
      name: "Control",
      type: "socks5",
    });
  });

  it("parses naked proxy and SSH forms", () => {
    const naked = parseSimpleProxy("user:pass@naked.example.com:1080{Naked}", "socks5");
    const usernameOnly = parseSimpleProxy("user@naked-default.example.com{UserOnly}", "socks5");
    const noAuth = parseSimpleProxy("plain.example.com:8080", "http");
    const withRefresh = parseSimpleProxy("refresh.example.com:8080[https://refresh.example.com/sub]{Refresh}", "http");
    const colon = parseSimpleProxy("colon-naked.example.com:8080:user:p:a:ss", "http");
    const ssh = parseSsh(
      "ssh://root:secret@ssh.example.com:22?private-key=KEY&host-key=a,b&server-fingerprint=fp&idle-timeout=30&host-key-algorithms=ssh-ed25519|rsa&allow-insecure=1#SSH"
    );
    const sshAliases = parseSsh("ssh://alias@ssh-alias.example.com?private_key=KEY&hostKey=a;b&idle_timeout=bad#AliasSSH");
    const sshEmptyHostKey = parseSsh("ssh://ssh-empty.example.com?host-key=,&private-key=KEY#EmptyHostKey");

    expect(naked).toMatchObject({
      name: "Naked",
      type: "socks5",
      server: "naked.example.com",
      username: "user",
      password: "pass",
    });
    expect(usernameOnly).toMatchObject({
      name: "UserOnly",
      server: "naked-default.example.com",
      port: 1080,
      username: "user",
    });
    expect(noAuth).toMatchObject({
      name: "HTTP-plain.example.com:8080",
      type: "http",
      server: "plain.example.com",
      port: 8080,
    });
    expect(withRefresh).toMatchObject({
      name: "Refresh",
      server: "refresh.example.com",
      port: 8080,
    });
    expect(colon).toMatchObject({
      name: "HTTP-colon-naked.example.com:8080",
      type: "http",
      server: "colon-naked.example.com",
      port: 8080,
      username: "user",
      password: "p:a:ss",
    });
    expect(() => parseSimpleProxy("[2001:db8::2]:1080{IPv6 Naked}", "socks5")).toThrow("无效的端口号");
    expect(() => parseSimpleProxy("user@[2001:db8::1]{IPv6}", "socks5")).toThrow("缺少服务器地址");
    expect(ssh).toMatchObject({
      name: "SSH",
      type: "ssh",
      server: "ssh.example.com",
      username: "root",
      password: "secret",
      "private-key": "KEY",
      "host-key": ["a", "b"],
      "server-fingerprint": "fp",
      "idle-timeout": 30,
      "host-key-algorithms": ["ssh-ed25519", "rsa"],
      "skip-cert-verify": true,
    });
    expect(sshAliases).toMatchObject({
      name: "AliasSSH",
      server: "ssh-alias.example.com",
      port: 22,
      username: "alias",
      "private-key": "KEY",
      "host-key": ["a", "b"],
    });
    expect(sshAliases).not.toHaveProperty("idle-timeout");
    expect(sshEmptyHostKey).toMatchObject({
      name: "EmptyHostKey",
      "private-key": "KEY",
    });
    expect(sshEmptyHostKey).not.toHaveProperty("host-key");
  });

  it("keeps malformed suffixes and edge auth fields explicit in simple proxy forms", () => {
    expect(parseSimpleProxy("suffix.example.com:8080}", "http")).toMatchObject({
      name: "HTTP-suffix.example.com:8080",
      server: "suffix.example.com",
      port: 8080,
    });
    expect(parseSimpleProxy("nested.example.com:8080{bad}}", "http")).toMatchObject({
      name: "HTTP-nested.example.com:8080",
      server: "nested.example.com",
      port: 8080,
    });
    expect(parseHttp("http://empty-headers.example.com:8080?headers= ")).not.toHaveProperty("headers");
    expect(parseHttp("http://pipe.example.com:8080?headers=A:B||C:D")).toMatchObject({
      headers: { A: "B", C: "D" },
    });

    const encodedHttp = Buffer.from("http-base.example.com:8080").toString("base64url");
    expect(parseHttp(`http://${encodedHttp}?remark=EncodedName`)).toMatchObject({
      name: "EncodedName",
      server: "http-base.example.com",
      port: 8080,
    });

    const encodedMissingPort = Buffer.from("alice:secret@socks-missing-port.example.com").toString("base64url");
    expect(parseSocks(`socks://${encodedMissingPort}#MissingPort`)).toMatchObject({
      name: "MissingPort",
      server: encodedMissingPort,
      port: 1080,
    });

    expect(parseSsh("ssh://ssh-minimal.example.com")).toMatchObject({
      name: "SSH-ssh-minimal.example.com:22",
      server: "ssh-minimal.example.com",
      port: 22,
    });
    expect(parseHttp("https://forced.example.com")).toMatchObject({
      type: "https",
      port: 443,
      tls: true,
    });
  });

  it("covers standard URL branch fallbacks without changing compatibility behavior", () => {
    const encodedUsernameOnly = Buffer.from("alice@base64-user.example.com:8080").toString("base64url");
    const encodedHash = Buffer.from("hash-base.example.com:8080").toString("base64url");
    const encodedSuffix = Buffer.from("suffix-base.example.com:8080").toString("base64url");
    const encodedAuthWithoutColon = Buffer.from("only-user").toString("base64url");

    expect(parseHttp(`http://${encodedUsernameOnly}#EncodedUser`)).toMatchObject({
      name: "EncodedUser",
      server: "base64-user.example.com",
      port: 8080,
      username: "alice",
    });
    expect(parseHttp(`http://${encodedHash}#HashName`)).toMatchObject({
      name: "HashName",
      server: "hash-base.example.com",
      port: 8080,
    });
    expect(parseHttp(`http://${encodedSuffix}{SuffixName}`)).toMatchObject({
      name: "SuffixName",
      server: "suffix-base.example.com",
      port: 8080,
    });
    expect(parseHttp('http://number-header.example.com:8080?headers={"A":1}')).not.toHaveProperty("headers");
    expect(parseHttp("http://empty-bool.example.com:8080?allow-insecure=&tls-name=tls.example.com")).toMatchObject({
      name: "HTTP-empty-bool.example.com:8080",
      sni: "tls.example.com",
    });
    expect(parseSocks(`socks5://${encodedAuthWithoutColon}@encoded-user.example.com:1080#RawEncoded`)).toMatchObject({
      name: "RawEncoded",
      username: encodedAuthWithoutColon,
      server: "encoded-user.example.com",
    });
    expect(() => parseSocks("socks://")).toThrow("缺少服务器地址");
    expect(() => parseSocks("socks.example.com:1080")).toThrow("无效的 SOCKS 链接");
    expect(() => parseHttp("http://badcolon.example.com:x:user:pass")).toThrow("无效的端口号");
    expect(() => parseHttp("http://:8080:user:pass")).toThrow("缺少服务器地址");
    expect(parseSimpleProxy("user@[2001:db8::1]x", "socks5")).toMatchObject({
      username: "user",
      server: "2001:db8::1",
      port: 1080,
    });
  });

  it("parses Telegram-style proxy links and keeps validation errors explicit", () => {
    expect(parseTelegramProxyLink("tg://socks?server=tg.example.com&port=1080&user=u&pass=p&remark=TG")).toMatchObject({
      name: "TG",
      type: "socks5",
      server: "tg.example.com",
      username: "u",
      password: "p",
    });
    expect(parseTelegramProxyLink("https://t.me/https?server=tg-http.example.com&port=443")).toMatchObject({
      type: "https",
      server: "tg-http.example.com",
      port: 443,
      tls: true,
    });
    expect(parseTelegramProxyLink("tg://http?server=default-name.example.com&port=8080")).toMatchObject({
      name: "HTTP-default-name.example.com:8080",
      type: "http",
      server: "default-name.example.com",
      port: 8080,
    });
    expect(parseTelegramProxyLink("tg://https?server=tg-secure.example.com&port=443&remarks=SecureTG")).toMatchObject({
      name: "SecureTG",
      type: "https",
      server: "tg-secure.example.com",
      tls: true,
    });
    expect(parseTelegramProxyLink("https://t.me/socks/proxy?server=tg-path.example.com&port=1080")).toMatchObject({
      name: "SOCKS-tg-path.example.com:1080",
      type: "socks5",
      server: "tg-path.example.com",
    });

    expect(() => parseSocks("http://example.com:1080")).toThrow("无效的 SOCKS 链接");
    expect(() => parseSimpleProxy("ftp://example.com:21")).toThrow("不支持的协议: ftp");
    expect(() => parseSimpleProxy("bad", "http")).toThrow("无效的代理格式");
    expect(() => parseSimpleProxy(":1080", "http")).toThrow("缺少服务器地址");
    expect(() => parseSimpleProxy("example.com:70000")).toThrow("无效的端口号");
    expect(() => parseTelegramProxyLink("tg://bad?server=x&port=1")).toThrow("无效的 Telegram 代理链接");
    expect(() => parseTelegramProxyLink("https://example.com/socks?server=x&port=1080")).toThrow(
      "无效的 Telegram 代理链接"
    );
    expect(() => parseTelegramProxyLink("https://t.me/?server=x&port=1080")).toThrow("无效的 Telegram 代理链接");
    expect(() => parseTelegramProxyLink("tg://socks?port=1080")).toThrow("缺少服务器地址");
    expect(() => parseTelegramProxyLink("tg://socks?server=x&port=70000")).toThrow("无效的端口号");
  });
});
