import path from "node:path";
import { spawnSync } from "node:child_process";
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

function installScenario(options = "", dockerVersion = "28.1.0") {
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
    compose() { if [ "$*" = 'config --services' ]; then printf 'app\\ndb\\ncron\\n'; fi; return 0; }
    wait_for_health() { return 0; }
    main
    grep -E '^(APP_URL|SUBBOOST_PORT|SUBBOOST_BIND_ADDRESS)=' "$SUBBOOST_HOME/.env"
  `);
}

function firstUpdateScenario(scenario: "matching" | "different" | "missing") {
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
SUBBOOST_PORT=31000
ENV
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
    set +e
    bash "$base/manager" update
    status=$?
    set -e
    printf 'update-status=%s\\n' "$status"
    [ -z "$(find "$TMPDIR" -mindepth 1 -print -quit)" ]
    if [ '${scenario}' = matching ]; then
      [ "$status" = 0 ]
      cmp -s "$base/manager" "$SUBBOOST_BIN"
      grep -qx 'APP_URL=http://local.subboost.test:31000' "$SUBBOOST_HOME/.env"
      grep -qx 'SUBBOOST_PORT=31000' "$SUBBOOST_HOME/.env"
      ! grep -q '^SUBBOOST_BIND_ADDRESS=' "$SUBBOOST_HOME/.env"
      printf 'legacy-settings-preserved\\n'
    else
      [ "$status" != 0 ]
      [ ! -s "$DOCKER_LOG" ]
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
  }, 20_000);

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
      printf 'dir=%s file=%s\\n' "$(stat -c %a "$TMP_DIR")" "$(stat -c %a "$TMP_DIR/env")"
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

  it("updates an existing installation by running the downloaded manager first", () => {
    const result = firstUpdateScenario("matching");
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("update-status=0");
    expect(result.stdout).toContain("legacy-settings-preserved");
    expect(result.stdout).not.toContain("LEGACY_MANAGER_EXECUTED");
  }, 20_000);

  it.each(["different", "missing"] as const)("stops the first update when release assets are %s", (scenario) => {
    const result = firstUpdateScenario(scenario);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("stopped-before-docker");
    expect(result.stderr).toContain(scenario === "different" ? "does not match" : "secure manager update aborted");
  }, 20_000);
});
