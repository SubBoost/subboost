import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicRoot = path.resolve(__dirname, "../..");

function runBash(script: string) {
  return spawnSync("bash", ["-lc", 'exec "$BASH" -s'], {
    cwd: publicRoot,
    encoding: "utf8",
    input: script,
    timeout: 30_000,
    env: { ...process.env, LC_ALL: "C.UTF-8" },
  });
}

function composeModel(hostIp: string | null = "127.0.0.1", published = "31000") {
  return JSON.stringify({ services: { app: { ports: [{ ...(hostIp ? { host_ip: hostIp } : {}), target: 3000, published, protocol: "tcp" }] } } }, null, 2);
}

function installScenario(options = "", dockerVersion = "28.1.0", hostIp: string | null = "127.0.0.1") {
  return runBash(`
    set -Eeuo pipefail
    base="$(mktemp -d)"
    trap 'rm -rf "$base"' EXIT
    mkdir -p "$base/tmp" "$base/release" "$base/bin"
    export TMPDIR="$base/tmp" SUBBOOST_HOME="$base/home" SUBBOOST_BIN="$base/bin/subboost"
    export SUBBOOST_SCRIPT_SOURCE_ONLY=1 SUBBOOST_ASSUME_YES=1 SUBBOOST_PORT=31000
    unset APP_URL SUBBOOST_ACCESS_MODE SUBBOOST_BIND_ADDRESS
    export SUBBOOST_RELEASE_URL="file://$base/release/release.json"
    export SUBBOOST_UPDATE_RELEASE_URL="$SUBBOOST_RELEASE_URL"
    cat > "$base/release/release.json" <<'JSON'
{"image":"new-image","composeUrl":"compose.yml","managerUrl":"manager"}
JSON
    cp local/docker-compose.image.yml "$base/release/compose.yml"
    cp local/scripts/subboost.sh "$base/release/manager"
    ${options}
    source local/scripts/install.sh
    is_root() { return 0; }
    require_linux() { :; }
    ensure_docker() { :; }
    docker_login_if_needed() { :; }
    port_can_be_used() { return 0; }
    docker_cmd() { if [ "$1" = version ]; then printf '%s\\n' '${dockerVersion}'; fi; return 0; }
    compose() {
      case "$*" in
        'config --services') printf 'app\\ndb\\ncron\\n' ;;
        'config --format json') printf '%s\\n' '${composeModel(hostIp)}' ;;
        pull|up*) printf 'unexpected-start=%s\\n' "$*" ;;
      esac
      return 0
    }
    wait_for_health() { return 0; }
    main
    grep -E '^(APP_URL|SUBBOOST_PORT|SUBBOOST_BIND_ADDRESS)=' "$SUBBOOST_HOME/.env"
  `);
}

function firstUpdateScenario(scenario: "matching" | "different" | "missing", binding = "", hostIp: string | null = binding || null, succeeds = scenario === "matching", noParser = false, oldHost: string | null = binding || null, candidatePort = "31000", oldPort = "31000", envPort = "31000") {
  return runBash(`
    set -Eeuo pipefail
    base="$(mktemp -d)"
    trap 'rm -rf "$base"' EXIT
    mkdir -p "$base/tmp" "$base/home" "$base/bin" "$base/release"
    export TMPDIR="$base/tmp" SUBBOOST_HOME="$base/home" SUBBOOST_BIN="$base/bin/subboost"
    export SUBBOOST_REQUIRE_MANAGER_UPDATE=1 DOCKER_LOG="$base/docker.log"
    export SUBBOOST_DOCTOR_HEALTH_ATTEMPTS=1 SUBBOOST_DOCTOR_HEALTH_INTERVAL_SECONDS=0
    cp local/scripts/subboost.sh "$base/manager"
    cp "$base/manager" "$base/release/manager"
    cp local/docker-compose.image.yml "$base/release/compose.yml"
    if [ '${scenario}' = different ]; then printf '# different manager\\n' >> "$base/release/manager"; fi
    cat > "$base/release/release.json" <<'JSON'
{"image":"new-image","composeUrl":"compose.yml","managerUrl":"manager"}
JSON
    printf '#!/usr/bin/env bash\\necho LEGACY_MANAGER_EXECUTED\\nexit 37\\n' > "$SUBBOOST_BIN"
    cp "$base/release/compose.yml" "$SUBBOOST_HOME/docker-compose.yml"
    release_url="file://$base/release/release.json"
    if [ '${scenario}' = missing ]; then release_url="file://$base/release/missing.json"; fi
    cat > "$SUBBOOST_HOME/.env" <<ENV
SUBBOOST_RELEASE_URL=$release_url
SUBBOOST_IMAGE=old-image
POSTGRES_DB=subboost
POSTGRES_USER=subboost
POSTGRES_PASSWORD=password
DATABASE_URL=postgresql://subboost:password@db:5432/subboost?schema=public
ENCRYPTION_KEY=key
JWT_SECRET=jwt
CRON_SECRET=cron
APP_URL=http://local.subboost.test:31000
SUBBOOST_PORT=${envPort}
ENV
    if [ -n '${binding}' ]; then printf 'SUBBOOST_BIND_ADDRESS=%s\\n' '${binding}' >> "$SUBBOOST_HOME/.env"; fi
    : > "$DOCKER_LOG"
    sudo() { if [ "$1" = chown ]; then return 0; fi; "$@"; }
    curl() { return 0; }
    docker() {
      printf '%s\\n' "$*" >> "$DOCKER_LOG"
      case "$1" in
        info) return 0 ;;
        inspect)
          case "$*" in
            *'{{.Image}}'*) printf 'sha256:old-image\\n' ;;
            *'.State.Status'*) printf 'running\\n' ;;
            *'.State.Health'*) printf 'healthy\\n' ;;
          esac
          return 0 ;;
        compose)
          case "$*" in
            *' config --services') printf 'app\\ndb\\ncron\\n' ;;
            *' config --format json')
              case "$*" in
                *candidate-compose.yml*) printf '%s\\n' '${composeModel(hostIp, candidatePort)}' ;;
                *) printf '%s\\n' '${composeModel(oldHost, oldPort)}' ;;
              esac ;;
            *' ps -q app') printf 'app-id\\n' ;;
            *' ps -q db') printf 'db-id\\n' ;;
            *' ps -q cron') printf 'cron-id\\n' ;;
            *'pg_dump -Fc'*) printf 'custom-dump' ;;
            *'pg_restore --list'*) cat >/dev/null ;;
          esac
          return 0 ;;
      esac
      return 0
    }
    export -f sudo curl docker
    ${noParser ? 'command() { if [ "$1" = -v ]; then case "$2" in python3|node|jq) return 1;; esac; fi; builtin command "$@"; }; export -f command' : ""}
    set +e
    bash "$base/manager" update
    status=$?
    set -e
    printf 'update-status=%s\\n' "$status"
    [ -z "$(find "$TMPDIR" -mindepth 1 -print -quit)" ]
    if [ '${succeeds ? "1" : "0"}' = 1 ]; then
      [ "$status" = 0 ]
      cmp -s "$base/manager" "$SUBBOOST_BIN"
      grep -qx 'APP_URL=http://local.subboost.test:31000' "$SUBBOOST_HOME/.env"
      grep -qx 'SUBBOOST_PORT=${envPort}' "$SUBBOOST_HOME/.env"
      if [ -n '${binding}' ]; then grep -qx 'SUBBOOST_BIND_ADDRESS=${binding}' "$SUBBOOST_HOME/.env"; else ! grep -q '^SUBBOOST_BIND_ADDRESS=' "$SUBBOOST_HOME/.env"; fi
      printf 'legacy-settings-preserved\\n'
    else
      [ "$status" != 0 ]
      ! grep -Eq ' (pull|stop|up)( |$)' "$DOCKER_LOG"
      grep -q LEGACY_MANAGER_EXECUTED "$SUBBOOST_BIN"
      printf 'stopped-before-docker\\n'
    fi
  `);
}

describe("self-host access and temporary workspace", () => {
  it("defaults to a local binding with an actionable SSH tunnel", () => {
    const result = installScenario();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("SUBBOOST_BIND_ADDRESS=127.0.0.1");
    expect(result.stdout).toContain("APP_URL=http://127.0.0.1:31000");
    expect(result.stdout).toContain("ssh -L 31000:127.0.0.1:31000");
  }, 20_000);

  it("uses the configured HTTPS proxy URL without appending the internal port", () => {
    for (const url of ["https://local.subboost.test", "https://local.subboost.test:8443"]) {
      const result = installScenario(`export SUBBOOST_ACCESS_MODE=https APP_URL='${url}'`);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`APP_URL=${url}\n`);
      expect(result.stdout).toContain("SUBBOOST_BIND_ADDRESS=127.0.0.1");
      expect(result.stderr).toContain("安装器不会配置 TLS");
    }
  }, 40_000);

  it("keeps explicit trusted-network HTTP available and warns about plaintext", () => {
    const result = installScenario("export SUBBOOST_ACCESS_MODE=public-http APP_URL=http://local.subboost.test");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("SUBBOOST_BIND_ADDRESS=\n");
    expect(result.stdout).toContain("APP_URL=http://local.subboost.test:31000");
    expect(result.stderr).toContain("HTTP 未加密");
  }, 20_000);

  it("rejects an external URL in default SSH mode and malformed proxy URLs", () => {
    const noChoice = installScenario("export APP_URL=http://local.subboost.test");
    expect(noChoice.status).not.toBe(0);
    expect(noChoice.stderr).toContain("SSH 模式的 APP_URL");
    const invalidProxy = installScenario("export SUBBOOST_ACCESS_MODE=https APP_URL=https://local.subboost.test/path");
    expect(invalidProxy.status).not.toBe(0);
    expect(invalidProxy.stderr).toContain("请输入有效的 HTTPS 地址");
  }, 20_000);

  it("rejects URL ports outside the valid range", () => {
    for (const options of [
      "export SUBBOOST_ACCESS_MODE=https APP_URL=https://local.subboost.test:99999",
      "export SUBBOOST_ACCESS_MODE=public-http APP_URL=http://local.subboost.test:0",
    ]) {
      const result = installScenario(options);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("端口");
      expect(result.stdout).not.toContain("unexpected-start=");
    }
  }, 40_000);

  it("accepts decimal ports with leading zeroes across installation and updates", () => {
    const installed = installScenario("export SUBBOOST_PORT=031000");
    expect(installed.status, installed.stderr).toBe(0);
    expect(installed.stdout).toContain("SUBBOOST_PORT=31000");
    for (const noParser of [false, true]) {
      const updated = firstUpdateScenario("matching", "", null, true, noParser, null, "31000", "31000", "031000");
      expect(updated.status, `${updated.stdout}\n${updated.stderr}`).toBe(0);
      expect(updated.stdout).toContain("legacy-settings-preserved");
    }
  }, 60_000);

  it("validates IPv6 literal structure using Bash only", () => {
    const result = runBash(`
      set -Eeuo pipefail
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      source local/scripts/install.sh
      for address in '::' '::1' '2001:db8::1' '2001:db8::' '1:2:3:4:5:6:7:8'; do
        valid_ipv6_literal "$address" || { printf 'rejected=%s\\n' "$address"; exit 1; }
      done
      for address in ':::' '1::2::3' ':1::2' '1::2:' '12345::1' '1:2:3:4:5:6:7' '1:2:3:4:5:6:7::8' 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff:1'; do
        if valid_ipv6_literal "$address"; then printf 'accepted=%s\\n' "$address"; exit 1; fi
      done
    `);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("accepts valid IPv6 URLs and rejects invalid IPv6 URLs before startup", () => {
    for (const url of ["https://[::1]:8443", "https://[2001:db8::1]"]) {
      const result = installScenario(`export SUBBOOST_ACCESS_MODE=https APP_URL='${url}'`);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`APP_URL=${url}\n`);
    }
    for (const url of ["https://[:::]:8443", "https://[2001:db8:12345::1]"]) {
      const result = installScenario(`export SUBBOOST_ACCESS_MODE=https APP_URL='${url}'`);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("IPv6");
      expect(result.stdout).not.toContain("unexpected-start=");
    }
  }, 60_000);

  it("rejects an old Compose configuration before starting a restricted installation", () => {
    for (const options of ["", "export SUBBOOST_ACCESS_MODE=https APP_URL=https://local.subboost.test"]) {
      const result = installScenario(options, "28.1.0", null);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Compose");
      expect(result.stdout).not.toContain("unexpected-start=");
    }
    const explicitHttp = installScenario("export SUBBOOST_ACCESS_MODE=public-http APP_URL=http://local.subboost.test", "28.1.0", null);
    expect(explicitHttp.status, explicitHttp.stderr).toBe(0);
  }, 60_000);

  it("stops an unsafe restricted update before pull while preserving legacy and restricted healthy updates", () => {
    const unsafe = firstUpdateScenario("matching", "127.0.0.1", null, false);
    expect(unsafe.status, `${unsafe.stdout}\n${unsafe.stderr}`).toBe(0);
    expect(unsafe.stdout).toContain("stopped-before-docker");
    expect(unsafe.stderr).toContain("Compose");
    for (const [binding, hostIp] of [["", null], ["127.0.0.1", "127.0.0.1"]] as const) {
      const healthy = firstUpdateScenario("matching", binding, hostIp);
      expect(healthy.status, `${healthy.stdout}\n${healthy.stderr}`).toBe(0);
      expect(healthy.stdout).toContain("legacy-settings-preserved");
    }
  }, 60_000);

  it("preserves a loopback binding written directly in an old Compose file", () => {
    const exposed = firstUpdateScenario("matching", "", null, false, false, "127.0.0.1");
    expect(exposed.status, `${exposed.stdout}\n${exposed.stderr}`).toBe(0);
    expect(exposed.stdout).toContain("stopped-before-docker");
    expect(exposed.stderr).toContain("Compose");
    const unchanged = firstUpdateScenario("matching", "", "127.0.0.1", true, false, "127.0.0.1");
    expect(unchanged.status, `${unchanged.stdout}\n${unchanged.stderr}`).toBe(0);
    const portChanged = firstUpdateScenario("matching", "", "127.0.0.1", false, false, "127.0.0.1", "31001");
    expect(portChanged.status, `${portChanged.stdout}\n${portChanged.stderr}`).toBe(0);
    expect(portChanged.stdout).toContain("stopped-before-docker");
    const oldPortChanged = firstUpdateScenario("matching", "", null, false, false, null, "31000", "31001");
    expect(oldPortChanged.status, `${oldPortChanged.stdout}\n${oldPortChanged.stderr}`).toBe(0);
    expect(oldPortChanged.stdout).toContain("stopped-before-docker");
    const noParser = firstUpdateScenario("matching", "", "127.0.0.1", false, true, "127.0.0.1");
    expect(noParser.status, `${noParser.stdout}\n${noParser.stderr}`).toBe(0);
    expect(noParser.stderr).toContain("Install Python 3, Node.js, or jq");
  }, 90_000);

  it.skipIf(spawnSync("docker", ["compose", "version"], { encoding: "utf8" }).status !== 0)(
    "checks actual Compose interpolation for both current and older port mappings",
    () => {
      const current = readFileSync(path.join(publicRoot, "local/docker-compose.image.yml"), "utf8");
      const old = current.replace('${SUBBOOST_BIND_ADDRESS:+${SUBBOOST_BIND_ADDRESS}:}${SUBBOOST_PORT:-3000}', '${SUBBOOST_PORT:-3000}');
      const oldLoopback = old.replace('"${SUBBOOST_PORT:-3000}:3000"', '"127.0.0.1:${SUBBOOST_PORT:-3000}:3000"');
      expect(old).not.toBe(current);
      expect(oldLoopback).not.toBe(old);
      for (const [file, isSafe] of [[current, true], [old, false], [oldLoopback, true]] as const) {
        const resolved = spawnSync("docker", ["compose", "-f", "-", "config", "--format", "json"], {
          cwd: publicRoot,
          input: file,
          encoding: "utf8",
          env: { ...process.env, SUBBOOST_BIND_ADDRESS: "127.0.0.1", SUBBOOST_PORT: "31000", SUBBOOST_IMAGE: "fixture", POSTGRES_DB: "fixture", POSTGRES_USER: "fixture", POSTGRES_PASSWORD: "fixture", DATABASE_URL: "postgresql://fixture", ENCRYPTION_KEY: "fixture", JWT_SECRET: "fixture", CRON_SECRET: "fixture", LOCAL_SETUP_TOKEN: "fixture", APP_URL: "http://127.0.0.1:31000", TRUST_PROXY_HEADERS: "false" },
        });
        expect(resolved.status, resolved.stderr).toBe(0);
        const encoded = Buffer.from(resolved.stdout).toString("base64");
        for (const script of ["install.sh", "subboost.sh"]) {
          const result = runBash(`export SUBBOOST_SCRIPT_SOURCE_ONLY=1; source local/scripts/${script}; printf '%s' '${encoded}' | base64 -d | validate_compose_binding 127.0.0.1 31000`);
          expect(result.status, `${script}: ${result.stderr}`).toBe(isSafe ? 0 : 1);
        }
        const inspection = runBash(`export SUBBOOST_SCRIPT_SOURCE_ONLY=1; source local/scripts/subboost.sh; printf '%s' '${encoded}' | base64 -d | inspect_compose_binding 31000`);
        expect(inspection.status, inspection.stderr).toBe(0);
        expect(inspection.stdout.trim()).toBe(isSafe ? "127.0.0.1|31000" : "|31000");
        const installerNoParser = runBash(`export SUBBOOST_SCRIPT_SOURCE_ONLY=1; source local/scripts/install.sh; command() { if [ "$1" = -v ]; then case "$2" in python3|node|jq) return 1;; esac; fi; builtin command "$@"; }; printf '%s' '${encoded}' | base64 -d | validate_compose_binding 127.0.0.1 31000`);
        expect(installerNoParser.status, installerNoParser.stderr).toBe(isSafe ? 0 : 1);
        const noParser = runBash(`export SUBBOOST_SCRIPT_SOURCE_ONLY=1; source local/scripts/subboost.sh; command() { if [ "$1" = -v ]; then case "$2" in python3|node|jq) return 1;; esac; fi; builtin command "$@"; }; printf '%s' '${encoded}' | base64 -d | inspect_compose_binding 31000`);
        expect(noParser.status, noParser.stderr).toBe(isSafe ? 1 : 0);
        if (!isSafe) expect(noParser.stdout.trim()).toBe("|31000");
        const unbound = runBash(`export SUBBOOST_SCRIPT_SOURCE_ONLY=1; source local/scripts/subboost.sh; command() { if [ "$1" = -v ]; then case "$2" in python3|node|jq) return 1;; esac; fi; builtin command "$@"; }; printf '%s' '${encoded}' | base64 -d | validate_compose_binding '' 31000`);
        expect(unbound.status, unbound.stderr).toBe(isSafe ? 1 : 0);
      }
    },
    40_000,
  );

  it("rejects malformed, host-network and partially exposed models with each available JSON parser", () => {
    const port = { host_ip: "127.0.0.1", target: 3000, published: "31000", protocol: "tcp" };
    const defaultProtocol = { host_ip: "127.0.0.1", target: 3000, published: "31000" };
    const models = [
      [JSON.stringify({ services: { app: { ports: [port] } } }), 0],
      [JSON.stringify({ services: { app: { ports: [{ ...port, published: 31000 }] } } }), 0],
      [JSON.stringify({ services: { app: { ports: [defaultProtocol] } } }), 0],
      [JSON.stringify({ services: { app: { network_mode: "host", ports: [port] } } }), 1],
      [JSON.stringify({ services: { app: { ports: [port, { ...port, host_ip: "0.0.0.0" }] } } }), 1],
      [JSON.stringify({ services: { app: { ports: [{ ...port, target: 3001 }] } } }), 1],
      [JSON.stringify({ services: { app: { ports: [{ ...port, published: "31001" }] } } }), 1],
      [JSON.stringify({ services: { app: { ports: [{ ...port, protocol: "udp" }] } } }), 1],
      [JSON.stringify({ services: { app: { ports: [{ ...port, protocol: null }] } } }), 1],
      [JSON.stringify({ services: { app: { ports: [{ ...port, protocol: "" }] } } }), 1],
      ["{", 1],
    ] as const;
    const checks = models.map(([model, expected]) => `
      if printf '%s' '${Buffer.from(model).toString("base64")}' | base64 -d | validate_compose_binding 127.0.0.1 31000; then code=0; else code=$?; fi
      if [ "$code" != 0 ]; then code=1; fi
      [ "$code" = '${expected}' ] || { printf 'backend=%s expected=${expected} got=%s\\n' "$backend" "$code"; exit 19; }
    `).join("");
    for (const script of ["install.sh", "subboost.sh"]) {
      const result = runBash(`
        set -Eeuo pipefail
        export SUBBOOST_SCRIPT_SOURCE_ONLY=1
        source local/scripts/${script}
        for backend in python3 node jq; do
          builtin command -v "$backend" >/dev/null 2>&1 || continue
          command() { if [ "$1" = -v ]; then [ "$2" = "$backend" ] && builtin command -v "$2"; else builtin command "$@"; fi; }
          ${checks}
          unset -f command
          printf 'checked=%s\\n' "$backend"
        done
      `);
      expect(result.status, `${script}: ${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain("checked=node");
    }
  }, 40_000);

  it("inspects the previous binding and port with each available JSON parser", () => {
    const local = { host_ip: "127.0.0.1", target: 3000, published: "31000", protocol: "tcp" };
    const open = { target: 3000, published: 31000, protocol: "tcp" };
    const models = [
      [JSON.stringify({ services: { app: { ports: [local] } } }), "127.0.0.1|31000"],
      [JSON.stringify({ services: { app: { ports: [open] } } }), "|31000"],
      [JSON.stringify({ services: { app: { ports: [local, open] } } }), "reject"],
      [JSON.stringify({ services: { app: { ports: [local, { ...local, target: 8080, published: "31001" }] } } }), "reject"],
      [JSON.stringify({ services: { app: { network_mode: "host", ports: [local] } } }), "reject"],
      [JSON.stringify({ services: { app: { ports: [{ ...local, published: "" }] } } }), "reject"],
      ["{", "reject"],
    ] as const;
    const checks = models.map(([model, expected]) => `
      if output="$(printf '%s' '${Buffer.from(model).toString("base64")}' | base64 -d | inspect_compose_binding 31000)"; then code=0; else code=1; fi
      if [ '${expected}' = reject ]; then [ "$code" = 1 ]; else [ "$code" = 0 ] && [ "$output" = '${expected}' ]; fi || { printf 'backend=%s expected=${expected} got=%s code=%s\\n' "$backend" "$output" "$code"; exit 19; }
    `).join("");
    const result = runBash(`
      set -Eeuo pipefail
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      source local/scripts/subboost.sh
      for backend in python3 node jq; do
        builtin command -v "$backend" >/dev/null 2>&1 || continue
        command() { if [ "$1" = -v ]; then [ "$2" = "$backend" ] && builtin command -v "$2"; else builtin command "$@"; fi; }
        ${checks}
        unset -f command
        printf 'checked=%s\\n' "$backend"
      done
    `);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("checked=node");
  }, 30_000);

  it("accepts the standard restricted install without a JSON parser and rejects unsafe mappings", () => {
    const noParser = 'command() { if [ "$1" = -v ]; then case "$2" in python3|node|jq) return 1;; esac; fi; builtin command "$@"; }';
    const restricted = installScenario(noParser);
    expect(restricted.status, restricted.stderr).toBe(0);
    expect(restricted.stdout).toContain("SUBBOOST_BIND_ADDRESS=127.0.0.1");
    const unsafe = installScenario(noParser, "28.1.0", null);
    expect(unsafe.status).not.toBe(0);
    expect(unsafe.stderr).toContain("Install Python 3, Node.js, or jq");
    const http = installScenario(`export SUBBOOST_ACCESS_MODE=public-http APP_URL=http://local.subboost.test\n${noParser}`, "28.1.0", null);
    expect(http.status, http.stderr).toBe(0);
    const old = firstUpdateScenario("matching", "", null, true, true);
    expect(old.status, `${old.stdout}\n${old.stderr}`).toBe(0);
    expect(old.stdout).toContain("legacy-settings-preserved");
    const update = firstUpdateScenario("matching", "127.0.0.1", "127.0.0.1", false, true);
    expect(update.status, `${update.stdout}\n${update.stderr}`).toBe(0);
    expect(update.stderr).toContain("Install Python 3, Node.js, or jq");
    expect(update.stdout).toContain("stopped-before-docker");
  }, 60_000);

  it("fails closed for ambiguous restricted bindings without a JSON parser", () => {
    const local = { host_ip: "127.0.0.1", target: 3000, published: "31000", protocol: "tcp" };
    const models = [
      [JSON.stringify({ services: { app: { ports: [local] } } }, null, 2), 0],
      [JSON.stringify({ services: { app: { ports: [{ ...local, host_ip: "0.0.0.0" }] } } }, null, 2), 1],
      [JSON.stringify({ services: { app: { ports: [local, { ...local, host_ip: "0.0.0.0" }] } } }, null, 2), 1],
      [JSON.stringify({ services: { app: { network_mode: "host", ports: [local] } } }, null, 2), 1],
      [JSON.stringify({ services: { app: { ports: [{ ...local, published: "31001" }] } } }, null, 2), 1],
      [JSON.stringify({ services: { app: { ports: [{ ...local, target: 3001 }] } } }, null, 2), 1],
      [JSON.stringify({ services: { app: { ports: [{ ...local, protocol: "udp" }] } } }, null, 2), 1],
      ["", 1],
    ] as const;
    const checks = models.map(([model, expected]) => `
      if printf '%s' '${Buffer.from(model).toString("base64")}' | base64 -d | validate_compose_binding 127.0.0.1 31000; then code=0; else code=1; fi
      [ "$code" = '${expected}' ] || { printf 'expected=${expected} got=%s\\n' "$code"; exit 19; }
    `).join("");
    const result = runBash(`
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1; source local/scripts/install.sh
      command() { if [ "$1" = -v ]; then case "$2" in python3|node|jq) return 1;; esac; fi; builtin command "$@"; }
      ${checks}
    `);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  }, 30_000);

  it("fails closed without a JSON parser for empty output or another service binding", () => {
    const otherService = JSON.stringify({ services: { app: { ports: [{ target: 3000, published: "31000" }] }, db: { ports: [{ host_ip: "127.0.0.1", target: 5432, published: "5432" }] } } }, null, 2);
    for (const model of ["", otherService]) {
      const encoded = Buffer.from(model).toString("base64");
      const result = runBash(`export SUBBOOST_SCRIPT_SOURCE_ONLY=1; source local/scripts/subboost.sh; command() { if [ "$1" = -v ]; then case "$2" in python3|node|jq) return 1;; esac; fi; builtin command "$@"; }; printf '%s' '${encoded}' | base64 -d | inspect_compose_binding 31000`);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Install Python 3, Node.js, or jq");
    }
  });

  it("warns about older Docker without blocking installation", () => {
    const result = installScenario("", "27.5.1");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("Docker Engine 28 以下");
  }, 20_000);

  it.each(["install", "manager"])("ignores precreated %s PID paths and uses a private temporary directory", (kind) => {
    const filename = kind === "install" ? "install.sh" : "subboost.sh";
    const result = runBash(`
      set -Eeuo pipefail
      base="$(mktemp -d)"
      trap 'rm -rf "$base"' EXIT
      mkdir -p "$base/tmp"
      export TMPDIR="$base/tmp" SUBBOOST_HOME="$base" SUBBOOST_SCRIPT_SOURCE_ONLY=1
      old="$TMPDIR/subboost-${kind}.$$"
      mkdir "$old"
      printf 'attacker-data\\n' > "$old/env"
      printf 'original\\n' > "$base/live.env"
      umask 000
      source local/scripts/${filename}
      is_root() { return 0; }
      sudo_do() { "$@"; }
      ENV_FILE="$base/live.env"
      prepare_temp_directory
      [ "$TMP_DIR" != "$old" ]
      [ "$(umask)" = 0077 ]
      write_env_value PASSWORD example
      [ "$(cat "$old/env")" = attacker-data ]
      grep -qx 'PASSWORD=example' "$ENV_FILE"
      stat_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }
      printf 'dir=%s file=%s\\n' "$(stat_mode "$TMP_DIR")" "$(stat_mode "$TMP_DIR/env")"
    `);
    expect(result.status, result.stderr).toBe(0);
    if (process.platform !== "win32") expect(result.stdout).toContain("dir=700 file=600");
  });

  it.each(["install.sh", "subboost.sh"])("fails closed when %s cannot create a temporary directory", (filename) => {
    const result = runBash(`
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1 TMPDIR=/nonexistent-subboost-test-parent
      source local/scripts/${filename}
      prepare_temp_directory
    `);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Cannot create private temporary directory");
  });

  it("cleans the manager workspace when an update fails", () => {
    const result = runBash(`
      set -Eeuo pipefail
      base="$(mktemp -d)"
      trap 'rm -rf "$base"' EXIT
      mkdir -p "$base/tmp" "$base/home"
      export TMPDIR="$base/tmp" SUBBOOST_HOME="$base/home" SUBBOOST_BIN="$base/subboost"
      printf 'SUBBOOST_IMAGE=old-image\\nSUBBOOST_RELEASE_URL=file:///missing-manifest\\n' > "$SUBBOOST_HOME/.env"
      if bash local/scripts/subboost.sh update >/dev/null 2>&1; then exit 20; fi
      [ -z "$(find "$TMPDIR" -mindepth 1 -print -quit)" ]
    `);
    expect(result.status, result.stderr).toBe(0);
  });

  it.each(["after-load", "during-load"])("never cleans a TMP_DIR from the environment file: %s", (failure) => {
    const result = runBash(`
      set -Eeuo pipefail
      base="$(mktemp -d)"
      trap 'rm -rf "$base"' EXIT
      mkdir -p "$base/tmp with spaces" "$base/home" "$base/keep"
      printf 'preserve\\n' > "$base/keep/sentinel"
      export TMPDIR="$base/tmp with spaces" SUBBOOST_HOME="$base/home" SUBBOOST_BIN="$base/subboost"
      cat > "$SUBBOOST_HOME/.env" <<ENV
SUBBOOST_IMAGE=old-image
SUBBOOST_RELEASE_URL=file:///missing-manifest
TMP_DIR=$base/keep
SUBBOOST_SCRIPT_SOURCE_ONLY=1
ENV
      if [ '${failure}' = during-load ]; then printf 'nonexistent-subboost-test-command\\n' >> "$SUBBOOST_HOME/.env"; fi
      if bash local/scripts/subboost.sh update >/dev/null 2>&1; then exit 20; fi
      [ "$(cat "$base/keep/sentinel")" = preserve ]
      [ -z "$(find "$TMPDIR" -mindepth 1 -print -quit)" ]
    `);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  }, 20_000);

  it.each(["install.sh", "subboost.sh"])("does not clean a replaced %s workspace", (script) => {
    const result = runBash(`
      set -Eeuo pipefail
      base="$(mktemp -d)"
      trap 'rm -rf "$base"' EXIT
      mkdir -p "$base/tmp with spaces"
      export TMPDIR="$base/tmp with spaces" SUBBOOST_SCRIPT_SOURCE_ONLY=1
      (
        source local/scripts/${script}
        SUBBOOST_SCRIPT_SOURCE_ONLY=0
        trap '[ -z "$TMP_DIR" ] || rm -rf -- "$TMP_DIR"' EXIT
        prepare_temp_directory
        original="$TMP_DIR"
        mv "$original" "$original.saved"
        mkdir "$original"
        printf 'preserve\\n' > "$original/sentinel"
      )
      [ "$(cat "$TMPDIR"/subboost-*/sentinel)" = preserve ]
    `);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  }, 20_000);

  it.each(["install.sh", "subboost.sh"])("uses BSD stat when GNU stat is unavailable for %s", (script) => {
    const result = runBash(`
      set -Eeuo pipefail
      base="$(mktemp -d)"
      trap 'rm -rf "$base"' EXIT
      mkdir -p "$base/tmp"
      export TMPDIR="$base/tmp" SUBBOOST_SCRIPT_SOURCE_ONLY=1
      (
        source local/scripts/${script}
        SUBBOOST_SCRIPT_SOURCE_ONLY=0
        stat() {
          printf '%s\\n' "$1" >> "$base/stat-calls"
          [ "$1" = -f ] || return 1
          if command stat -c '%d:%i' -- "$3" >/dev/null 2>&1; then command stat -c '%d:%i' -- "$3"; else command stat -f '%d:%i' "$3"; fi
        }
        prepare_temp_directory
        [ -d "$TMP_DIR" ]
      )
      [ -z "$(find "$TMPDIR" -mindepth 1 -print -quit)" ]
      [ "$(grep -c -- -f "$base/stat-calls")" -ge 2 ]
    `);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  }, 20_000);

  it("updates an existing installation by running the downloaded manager first", () => {
    const result = firstUpdateScenario("matching");
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("update-status=0");
    expect(result.stdout).toContain("legacy-settings-preserved");
    expect(result.stdout).not.toContain("LEGACY_MANAGER_EXECUTED");
  }, 40_000);

  it.each(["different", "missing"] as const)("stops the first update when release assets are %s", (scenario) => {
    const result = firstUpdateScenario(scenario);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("stopped-before-docker");
    expect(result.stderr).toContain(scenario === "different" ? "does not match" : "secure manager update aborted");
  }, 20_000);
});
