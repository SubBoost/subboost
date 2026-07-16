import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const publicRoot = path.resolve(__dirname, "../..");
const BASH_NON_INTERACTIVE_COMMAND = "exec \"$BASH\" -s";

function runBash(script: string) {
  return spawnSync("bash", ["-lc", BASH_NON_INTERACTIVE_COMMAND], {
    cwd: publicRoot,
    encoding: "utf8",
    input: script,
    timeout: 30_000,
    detached: true,
    env: {
      ...process.env,
      LC_ALL: "C.UTF-8",
    },
  });
}

describe("self-host shell scripts", () => {
  it("preserves an explicit Docker config when Docker requires sudo", () => {
    const result = runBash(`
      set -Eeuo pipefail
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1
      source local/scripts/install.sh
      export DOCKER_CONFIG=/tmp/subboost-isolated-docker-config
      DOCKER_RUNNER="sudo docker"
      sudo() { printf 'sudo-call=%s\\n' "$*"; }
      docker_cmd info
    `);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "sudo-call=env DOCKER_CONFIG=/tmp/subboost-isolated-docker-config docker info",
    );
  });

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
      sudo_do() { "$@"; }
      docker() {
        if [ "$1" = "info" ]; then return 0; fi
        if [ "$1" = "compose" ]; then
          case "$*" in
            "compose version"*) return 0 ;;
            *" config --services") printf 'app\\ndb\\ncron\\n'; return 0 ;;
            *" config") return 0 ;;
            *" pull") return 0 ;;
            *"pg_dump -Fc"*) printf 'custom-dump'; return 0 ;;
            *"pg_restore --list"*) cat >/dev/null; return 0 ;;
            *" up -d --remove-orphans") return 0 ;;
            *" up -d --no-deps --force-recreate app") return 0 ;;
            *" ps -q app") printf 'app-id\\n'; return 0 ;;
            *" ps -q db") printf 'db-id\\n'; return 0 ;;
            *" ps -q cron") printf 'cron-id\\n'; return 0 ;;
          esac
        fi
        if [ "$1" = "inspect" ]; then
          case "$*" in
            *"{{.Image}}"*) printf 'sha256:old-image\\n'; return 0 ;;
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
    // wait_for_health checks live once per attempt, then status_cmd performs one final live+ready check.
    expect(result.stdout).toContain("curl_count=8");
  }, 10_000);

  it("uses refreshed release metadata before pulling during update", () => {
    const script = `
      set -Eeuo pipefail
      home="$(mktemp -d)"
      trap 'rm -rf "$home"' EXIT
      release_dir="$home/release"
      mkdir -p "$release_dir" "$home/bin"
      cat > "$release_dir/release.json" <<'JSON'
{"image":"new-image","composeUrl":"docker-compose.image.yml","managerUrl":"subboost-manager"}
JSON
      printf 'services:\\n  app:\\n    image: \${SUBBOOST_IMAGE}\\n' > "$release_dir/docker-compose.image.yml"
      printf '#!/usr/bin/env bash\\necho manager\\n' > "$release_dir/subboost-manager"
      cat > "$home/.env" <<ENV
SUBBOOST_RELEASE_URL=file://$release_dir/release.json
SUBBOOST_IMAGE=old-image
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
      export SUBBOOST_BIN="$home/bin/subboost"
      export SUBBOOST_DOCTOR_HEALTH_ATTEMPTS=1
      export SUBBOOST_DOCTOR_HEALTH_INTERVAL_SECONDS=0
      source local/scripts/subboost.sh
      sudo_do() { "$@"; }
      install_secret_file() { cp "$1" "$2"; }
      read_env_file() { cat "$ENV_FILE"; }
      docker_log="$home/docker-log"
      : > "$docker_log"
      docker() {
        printf 'command=%s\n' "$*" >> "$docker_log"
        if [ "$1" = "info" ]; then return 0; fi
        if [ "$1" = "compose" ]; then
          case "$*" in
            "compose version"*) return 0 ;;
            *" config --services") printf 'app\\ndb\\ncron\\n'; return 0 ;;
            *" config") return 0 ;;
            *" pull")
              printf 'pull_image=%s\\n' "\${SUBBOOST_IMAGE:-}" >> "$docker_log"
              return 0
              ;;
            *"pg_dump -Fc"*) printf 'custom-dump'; return 0 ;;
            *"pg_restore --list"*) cat >/dev/null; return 0 ;;
            *" up -d --remove-orphans") return 0 ;;
            *" up -d --no-deps --force-recreate app") return 0 ;;
            *" ps -q app") printf 'app-id\\n'; return 0 ;;
            *" ps -q db") printf 'db-id\\n'; return 0 ;;
            *" ps -q cron") printf 'cron-id\\n'; return 0 ;;
          esac
        fi
        if [ "$1" = "inspect" ]; then
          case "$*" in
            *"{{.Image}}"*) printf 'sha256:old-image\\n'; return 0 ;;
            *".State.Status"*) printf 'running\\n'; return 0 ;;
            *".State.Health"*) printf 'healthy\\n'; return 0 ;;
          esac
        fi
        return 0
      }
      curl() { return 0; }
      update_cmd
      cat "$docker_log"
      cat "$home/.env"
    `;

    const result = runBash(script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("pull_image=new-image");
    expect(result.stdout).toContain("SUBBOOST_IMAGE=new-image");
    expect(result.stdout).toContain("SUBBOOST_COMPOSE_URL=file://");
    expect(result.stdout).toContain("SUBBOOST_MANAGER_URL=file://");
    const pullIndex = result.stdout.search(/^command=compose.* pull$/m);
    const pauseIndex = result.stdout.indexOf(" stop cron app");
    const dumpIndex = result.stdout.indexOf("pg_dump -Fc");
    const candidateStartIndex = result.stdout.indexOf("candidate-compose.yml", dumpIndex);
    expect(pullIndex).toBeGreaterThanOrEqual(0);
    expect(pauseIndex).toBeGreaterThan(pullIndex);
    expect(dumpIndex).toBeGreaterThan(pauseIndex);
    expect(candidateStartIndex).toBeGreaterThan(dumpIndex);
  }, 10_000);

  it("migrates old fixed official update sources to stable latest", () => {
    const script = `
      set -Eeuo pipefail
      home="$(mktemp -d)"
      trap 'rm -rf "$home"' EXIT
      mkdir -p "$home/bin"
      cat > "$home/.env" <<'ENV'
SUBBOOST_RELEASE_URL=https://github.com/SubBoost/subboost/releases/download/v2.4.0/release.json
SUBBOOST_IMAGE=old-image
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
      export SUBBOOST_BIN="$home/bin/subboost"
      export SUBBOOST_DOCTOR_HEALTH_ATTEMPTS=1
      export SUBBOOST_DOCTOR_HEALTH_INTERVAL_SECONDS=0
      source local/scripts/subboost.sh
      sudo_do() { "$@"; }
      install_secret_file() { cp "$1" "$2"; }
      read_env_file() { cat "$ENV_FILE"; }
      download_log="$home/download-log"
      : > "$download_log"
      download_to_temp() {
        printf '%s\\n' "$1" >> "$download_log"
        case "$1" in
          *release.json)
            cat > "$2" <<'JSON'
{"image":"new-image","composeUrl":"docker-compose.image.yml","managerUrl":"subboost-manager"}
JSON
            ;;
          *)
            printf 'asset\\n' > "$2"
            ;;
        esac
      }
      docker_log="$home/docker-log"
      : > "$docker_log"
      docker() {
        if [ "$1" = "info" ]; then return 0; fi
        if [ "$1" = "compose" ]; then
          case "$*" in
            "compose version"*) return 0 ;;
            *" config --services") printf 'app\\ndb\\ncron\\n'; return 0 ;;
            *" config") return 0 ;;
            *" pull")
              printf 'pull_image=%s\\n' "\${SUBBOOST_IMAGE:-}" >> "$docker_log"
              return 0
              ;;
            *"pg_dump -Fc"*) printf 'custom-dump'; return 0 ;;
            *"pg_restore --list"*) cat >/dev/null; return 0 ;;
            *" up -d --remove-orphans") return 0 ;;
            *" up -d --no-deps --force-recreate app") return 0 ;;
            *" ps -q app") printf 'app-id\\n'; return 0 ;;
            *" ps -q db") printf 'db-id\\n'; return 0 ;;
            *" ps -q cron") printf 'cron-id\\n'; return 0 ;;
          esac
        fi
        if [ "$1" = "inspect" ]; then
          case "$*" in
            *"{{.Image}}"*) printf 'sha256:old-image\\n'; return 0 ;;
            *".State.Status"*) printf 'running\\n'; return 0 ;;
            *".State.Health"*) printf 'healthy\\n'; return 0 ;;
          esac
        fi
        return 0
      }
      curl() { return 0; }
      update_cmd
      cat "$download_log"
      cat "$docker_log"
      cat "$home/.env"
    `;

    const result = runBash(script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Detected old fixed release update source");
    expect(result.stdout).toContain("https://github.com/SubBoost/subboost/releases/latest/download/release.json");
    expect(result.stdout).toContain("pull_image=new-image");
    expect(result.stdout).toContain(
      "SUBBOOST_RELEASE_URL=https://github.com/SubBoost/subboost/releases/latest/download/release.json"
    );
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
      compose() {
        case "$*" in
          *"pg_dump -Fc"*) printf 'custom-dump' ;;
          *"pg_restore --list"*) cat >/dev/null ;;
        esac
      }
      cat > "$ENV_FILE" <<'ENV'
POSTGRES_DB=subboost
POSTGRES_USER=subboost
ENV
      for i in $(seq -w 1 12); do
        : > "$BACKUP_DIR/subboost-20240101T0000\${i}Z.dump"
        : > "$BACKUP_DIR/subboost-20240101T0000\${i}Z.env"
      done
      backup_cmd >/dev/null
      sql_count="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'subboost-*.dump' | wc -l | tr -d '[:space:]')"
      env_count="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'subboost-*.env' | wc -l | tr -d '[:space:]')"
      unsafe_files="$(find "$BACKUP_DIR" -maxdepth 1 -type f ! -perm 600 | wc -l | tr -d '[:space:]')"
      unsafe_dirs="$(find "$BACKUP_DIR" -maxdepth 0 -type d ! -perm 700 | wc -l | tr -d '[:space:]')"
      printf 'sql=%s env=%s unsafe_files=%s unsafe_dirs=%s\\n' "$sql_count" "$env_count" "$unsafe_files" "$unsafe_dirs"
      [ "$sql_count" = "10" ]
      [ "$env_count" = "10" ]
      [ "$unsafe_files" = "0" ]
      [ "$unsafe_dirs" = "0" ]
      [ ! -e "$BACKUP_DIR/subboost-20240101T000001Z.dump" ]
      [ ! -e "$BACKUP_DIR/subboost-20240101T000001Z.env" ]
    `;

    const result = runBash(script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("sql=10 env=10");
    expect(result.stdout).toContain("unsafe_files=0 unsafe_dirs=0");
  });
});
