import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const publicRoot = path.resolve(__dirname, "../..");
const BASH_NON_INTERACTIVE_COMMAND =
  "if command -v setsid >/dev/null 2>&1; then exec setsid \"$BASH\" -s; fi; exec \"$BASH\" -s";

function runBash(script: string) {
  return spawnSync("bash", ["-lc", BASH_NON_INTERACTIVE_COMMAND], {
    cwd: publicRoot,
    encoding: "utf8",
    input: script,
    timeout: 30_000,
    env: {
      ...process.env,
      LC_ALL: "C.UTF-8",
    },
  });
}

describe("self-host shell scripts", () => {
  it("uses prompt defaults without /dev/tty errors in non-interactive mode", () => {
    const result = runBash(`
      set -Eeuo pipefail
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      source local/scripts/install.sh
      export SUBBOOST_ASSUME_YES=0
      value="$(prompt 'Question: ' 'default-value')"
      printf 'value=%s\\n' "$value"
    `);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("value=default-value");
    expect(result.stderr).not.toContain("/dev/tty");
  });

  it("does not report Doctor OK when health checks fail", () => {
    const script = `
      set -Eeuo pipefail
      home="$(mktemp -d)"
      trap 'rm -rf "$home"' EXIT
      cat > "$home/.env" <<'ENV'
SUBBOOST_IMAGE=image
POSTGRES_DB=subboost
POSTGRES_USER=subboost
POSTGRES_PASSWORD=password
DATABASE_URL=postgresql://subboost:password@db:5432/subboost?schema=public
ENCRYPTION_KEY=key
JWT_SECRET=jwt
CRON_SECRET=cron
APP_URL=http://127.0.0.1:31000
SUBBOOST_PORT=31000
ENV
      : > "$home/docker-compose.yml"
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      export SUBBOOST_HOME="$home"
      export SUBBOOST_DOCTOR_HEALTH_ATTEMPTS=1
      export SUBBOOST_DOCTOR_HEALTH_INTERVAL_SECONDS=0
      source local/scripts/subboost.sh
      docker() {
        if [ "$1" = "info" ]; then return 0; fi
        if [ "$1" = "compose" ]; then
          case "$*" in
            "compose version"*) return 0 ;;
            *" config") return 0 ;;
            *" ps -q app") printf 'app-id\\n'; return 0 ;;
            *" ps -q db") printf 'db-id\\n'; return 0 ;;
            *" ps -q cron") printf 'cron-id\\n'; return 0 ;;
          esac
        fi
        if [ "$1" = "inspect" ]; then
          case "$*" in
            *".State.Status"*) printf 'running\\n'; return 0 ;;
            *".State.Health"*) printf 'healthy\\n'; return 0 ;;
          esac
        fi
        return 0
      }
      curl() { return 1; }
      set +e
      output="$(doctor_cmd 2>&1)"
      status=$?
      set -e
      printf 'status=%s\\n%s\\n' "$status" "$output"
      [ "$status" -ne 0 ]
      case "$output" in *"Doctor: OK"*) exit 44 ;; esac
      case "$output" in *"健康检查: 异常"*) exit 0 ;; *) exit 45 ;; esac
    `;

    const result = runBash(script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("status=1");
    expect(result.stdout).toContain("健康检查: 异常");
    expect(result.stdout).not.toContain("Doctor: OK");
    expect(result.stdout).toContain("ERROR: Health check failed: app is not responding.");
  });

  it("reports Doctor OK only after health checks pass", () => {
    const script = `
      set -Eeuo pipefail
      home="$(mktemp -d)"
      trap 'rm -rf "$home"' EXIT
      cat > "$home/.env" <<'ENV'
SUBBOOST_IMAGE=image
POSTGRES_DB=subboost
POSTGRES_USER=subboost
POSTGRES_PASSWORD=password
DATABASE_URL=postgresql://subboost:password@db:5432/subboost?schema=public
ENCRYPTION_KEY=key
JWT_SECRET=jwt
CRON_SECRET=cron
APP_URL=http://127.0.0.1:31000
SUBBOOST_PORT=31000
ENV
      : > "$home/docker-compose.yml"
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      export SUBBOOST_HOME="$home"
      export SUBBOOST_DOCTOR_HEALTH_ATTEMPTS=1
      export SUBBOOST_DOCTOR_HEALTH_INTERVAL_SECONDS=0
      source local/scripts/subboost.sh
      docker() {
        if [ "$1" = "info" ]; then return 0; fi
        if [ "$1" = "compose" ]; then
          case "$*" in
            "compose version"*) return 0 ;;
            *" config") return 0 ;;
            *" ps -q app") printf 'app-id\\n'; return 0 ;;
            *" ps -q db") printf 'db-id\\n'; return 0 ;;
            *" ps -q cron") printf 'cron-id\\n'; return 0 ;;
          esac
        fi
        if [ "$1" = "inspect" ]; then
          case "$*" in
            *".State.Status"*) printf 'running\\n'; return 0 ;;
            *".State.Health"*) printf 'healthy\\n'; return 0 ;;
          esac
        fi
        return 0
      }
      curl() { return 0; }
      doctor_cmd
    `;

    const result = runBash(script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("健康检查: 正常");
    expect(result.stdout).toContain("Doctor: OK");
  });

  it("loads SUBBOOST_PORT from .env before doctor health checks", () => {
    const script = `
      set -Eeuo pipefail
      home="$(mktemp -d)"
      trap 'rm -rf "$home"' EXIT
      cat > "$home/.env" <<'ENV'
SUBBOOST_IMAGE=image
POSTGRES_DB=subboost
POSTGRES_USER=subboost
POSTGRES_PASSWORD=password
DATABASE_URL=postgresql://subboost:password@db:5432/subboost?schema=public
ENCRYPTION_KEY=key
JWT_SECRET=jwt
CRON_SECRET=cron
APP_URL=http://127.0.0.1:31041
SUBBOOST_PORT=31041
ENV
      : > "$home/docker-compose.yml"
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      export SUBBOOST_HOME="$home"
      export SUBBOOST_DOCTOR_HEALTH_ATTEMPTS=1
      export SUBBOOST_DOCTOR_HEALTH_INTERVAL_SECONDS=0
      unset SUBBOOST_PORT APP_URL
      source local/scripts/subboost.sh
      docker() {
        if [ "$1" = "info" ]; then return 0; fi
        if [ "$1" = "compose" ]; then
          case "$*" in
            "compose version"*) return 0 ;;
            *" config") return 0 ;;
            *" ps -q app") printf 'app-id\\n'; return 0 ;;
            *" ps -q db") printf 'db-id\\n'; return 0 ;;
            *" ps -q cron") printf 'cron-id\\n'; return 0 ;;
          esac
        fi
        if [ "$1" = "inspect" ]; then
          case "$*" in
            *".State.Status"*) printf 'running\\n'; return 0 ;;
            *".State.Health"*) printf 'healthy\\n'; return 0 ;;
          esac
        fi
        return 0
      }
      curl_urls="$home/curl-urls"
      : > "$curl_urls"
      curl() {
        printf '%s\\n' "$*" >> "$curl_urls"
        case "$*" in
          *"http://127.0.0.1:31041/api/health/"*) return 0 ;;
        esac
        return 1
      }
      doctor_cmd
      cat "$curl_urls"
    `;

    const result = runBash(script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Doctor: OK");
    expect(result.stdout).toContain("http://127.0.0.1:31041/api/health/live");
    expect(result.stdout).toContain("http://127.0.0.1:31041/api/health/ready");
    expect(result.stdout).not.toContain("http://127.0.0.1:3000/api/health");
  });

  it("waits for health before reporting update status", () => {
    const script = `
      set -Eeuo pipefail
      home="$(mktemp -d)"
      trap 'rm -rf "$home"' EXIT
      cat > "$home/.env" <<'ENV'
SUBBOOST_IMAGE=image
POSTGRES_DB=subboost
POSTGRES_USER=subboost
POSTGRES_PASSWORD=password
DATABASE_URL=postgresql://subboost:password@db:5432/subboost?schema=public
ENCRYPTION_KEY=key
JWT_SECRET=jwt
CRON_SECRET=cron
APP_URL=http://127.0.0.1:31000
SUBBOOST_PORT=31000
ENV
      : > "$home/docker-compose.yml"
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      export SUBBOOST_HOME="$home"
      export SUBBOOST_DOCTOR_HEALTH_ATTEMPTS=3
      export SUBBOOST_DOCTOR_HEALTH_INTERVAL_SECONDS=0
      source local/scripts/subboost.sh
      docker() {
        if [ "$1" = "info" ]; then return 0; fi
        if [ "$1" = "compose" ]; then
          case "$*" in
            "compose version"*) return 0 ;;
            *" config") return 0 ;;
            *" pull") return 0 ;;
            *" up -d --remove-orphans") return 0 ;;
            *" up -d --no-deps --force-recreate app") return 0 ;;
            *" ps -q app") printf 'app-id\\n'; return 0 ;;
            *" ps -q db") printf 'db-id\\n'; return 0 ;;
            *" ps -q cron") printf 'cron-id\\n'; return 0 ;;
          esac
        fi
        if [ "$1" = "inspect" ]; then
          case "$*" in
            *".State.Status"*) printf 'running\\n'; return 0 ;;
            *".State.Health"*) printf 'healthy\\n'; return 0 ;;
          esac
        fi
        return 0
      }
      curl_count_file="$home/curl-count"
      ready_threshold=5
      printf '0\\n' > "$curl_count_file"
      curl() {
        count="$(cat "$curl_count_file")"
        count=$((count + 1))
        printf '%s\\n' "$count" > "$curl_count_file"
        case "$*" in
          *"/api/health/live"*) return 0 ;;
          *"/api/health/ready"*) [ "$count" -ge "$ready_threshold" ]; return $? ;;
        esac
        return 1
      }
      update_cmd
      printf 'curl_count=%s\\n' "$(cat "$curl_count_file")"
    `;

    const result = runBash(script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("健康检查: 正常");
    expect(result.stdout).not.toContain("健康检查: 异常");
    // wait_for_health stops once ready succeeds, then status_cmd performs one final live+ready check.
    expect(result.stdout).toContain("curl_count=7");
  }, 10_000);

  it("updates exact env keys without removing similarly prefixed names", () => {
    const script = `
      set -Eeuo pipefail
      home="$(mktemp -d)"
      trap 'rm -rf "$home"' EXIT
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      export SUBBOOST_HOME="$home"
      source local/scripts/subboost.sh
      install_secret_file() {
        cp "$1" "$2"
      }
      read_env_file() {
        cat "$ENV_FILE"
      }
      cat > "$ENV_FILE" <<'ENV'
SUBBOOST_PORT_EXTRA=keep
SUBBOOST_PORT=3000
APP_URL=http://old.example
ENV
      write_env_value SUBBOOST_PORT 31000
      cat "$ENV_FILE"
    `;

    const result = runBash(script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("SUBBOOST_PORT_EXTRA=keep");
    expect(result.stdout).toContain("SUBBOOST_PORT=31000");
    expect(result.stdout).not.toContain("SUBBOOST_PORT=3000");
  });

  it("prunes old backups without parsing ls output", () => {
    const script = `
      set -Eeuo pipefail
      base="$(mktemp -d)"
      home="$base/subboost home"
      mkdir -p "$home/backups"
      trap 'rm -rf "$base"' EXIT
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      export SUBBOOST_HOME="$home"
      source local/scripts/subboost.sh
      sudo_do() { "$@"; }
      load_env() { :; }
      compose() { printf 'dump'; }
      cat > "$ENV_FILE" <<'ENV'
POSTGRES_DB=subboost
POSTGRES_USER=subboost
ENV
      for i in $(seq -w 1 12); do
        : > "$BACKUP_DIR/subboost-20240101T0000\${i}Z.sql.gz"
        : > "$BACKUP_DIR/subboost-20240101T0000\${i}Z.env"
      done
      backup_cmd >/dev/null
      sql_count="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'subboost-*.sql.gz' | wc -l | tr -d '[:space:]')"
      env_count="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'subboost-*.env' | wc -l | tr -d '[:space:]')"
      printf 'sql=%s env=%s\\n' "$sql_count" "$env_count"
      [ "$sql_count" = "10" ]
      [ "$env_count" = "10" ]
      [ ! -e "$BACKUP_DIR/subboost-20240101T000001Z.sql.gz" ]
      [ ! -e "$BACKUP_DIR/subboost-20240101T000001Z.env" ]
    `;

    const result = runBash(script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("sql=10 env=10");
  });
});
