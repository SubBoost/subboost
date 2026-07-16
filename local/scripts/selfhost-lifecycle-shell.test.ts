import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicRoot = path.resolve(__dirname, "../..");

function runRollbackScenario(restoreFails: boolean) {
  const script = `
    set -Eeuo pipefail
    home="$(mktemp -d)"
    trap 'rm -rf "$home"' EXIT
    mkdir -p "$home/release" "$home/bin"
    cat > "$home/release/release.json" <<'JSON'
{"image":"new-image","composeUrl":"compose.yml","managerUrl":"manager"}
JSON
    printf 'services:\n  app: {}\n  db: {}\n  cron: {}\n' > "$home/release/compose.yml"
    printf '#!/usr/bin/env bash\nexit 0\n' > "$home/release/manager"
    cat > "$home/.env" <<ENV
SUBBOOST_RELEASE_URL=file://$home/release/release.json
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
    read_env_file() { cat "$ENV_FILE"; }
    log="$home/docker.log"
    state="$home/state"
    : > "$log"
    printf 'old\n' > "$state"
    docker() {
      printf '%s\n' "$*" >> "$log"
      if [ "$1" = "compose" ]; then
        case "$*" in
          *" config --services") printf 'app\ndb\ncron\n'; return 0 ;;
          *" config") return 0 ;;
          *" ps -q app") printf 'app-id\n'; return 0 ;;
          *"pg_dump -Fc"*) printf 'custom-dump'; return 0 ;;
          *"pg_restore --list"*) cat >/dev/null; return 0 ;;
          *"pg_restore --clean"*) cat >/dev/null; [ "${restoreFails ? "1" : "0"}" = "0" ]; return $? ;;
          *"candidate-compose.yml"*" up -d --no-deps app") printf 'candidate\n' > "$state"; return 0 ;;
          *"old-compose.yml"*" up -d app") printf 'old\n' > "$state"; return 0 ;;
        esac
        return 0
      fi
      if [ "$1" = "inspect" ]; then printf 'sha256:old-image\n'; return 0; fi
      return 0
    }
    curl() { [ "$(cat "$state")" = "old" ]; }
    set +e
    output="$(update_cmd 2>&1)"
    status=$?
    set -e
    printf 'status=%s\n%s\n' "$status" "$output"
    cat "$log"
    [ "$status" -ne 0 ]
  `;
  return spawnSync("bash", ["-lc", "exec \"$BASH\" -s"], {
    cwd: publicRoot,
    encoding: "utf8",
    input: script,
    timeout: 30_000,
    env: { ...process.env, LC_ALL: "C.UTF-8" },
  });
}

describe("self-host update rollback lifecycle", () => {
  it("restores the verified dump and old image after candidate health failure", () => {
    const result = runRollbackScenario(false);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Candidate update failed: candidate health check failed");
    expect(result.stdout).toContain("pg_restore --clean --if-exists --exit-on-error");
    expect(result.stdout).toContain("tag subboost-rollback:update-");
    expect(result.stdout).toContain("old-image");
    expect(result.stdout).toContain("Previous version restored successfully.");
  });

  it("keeps writers stopped and preserves the dump when database restore fails", () => {
    const result = runRollbackScenario(true);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Automatic rollback stopped: database restore failed");
    expect(result.stdout).toContain("Keep app and cron stopped");
    expect(result.stdout).toMatch(/old-compose\.yml.* stop cron app/);
    expect(result.stdout).not.toMatch(/old-compose\.yml.* up -d app/);
  });

  it("never deletes a volume that existed before a failed installation", () => {
    const result = spawnSync("bash", ["-lc", "exec \"$BASH\" -s"], {
      cwd: publicRoot,
      encoding: "utf8",
      input: `
        set -Eeuo pipefail
        home="$(mktemp -d)"
        trap 'rm -rf "$home"' EXIT
        : > "$home/env"
        : > "$home/compose.yml"
        printf 'existing-volume\n' > "$home/volumes.before"
        export SUBBOOST_SCRIPT_SOURCE_ONLY=1 SUBBOOST_HOME="$home"
        source local/scripts/install.sh
        ENV_FILE="$home/env" COMPOSE_FILE="$home/compose.yml" DOCKER_RUNNER=docker
        docker() {
          case "$*" in
            "volume ls -q"*) printf 'existing-volume\nnew-volume\n' ;;
            "volume rm"*) printf 'removed=%s\n' "$3" >> "$home/removed" ;;
          esac
        }
        cleanup_failed_install "$home/volumes.before"
        cat "$home/removed"
      `,
      timeout: 30_000,
      env: { ...process.env, LC_ALL: "C.UTF-8" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("removed=new-volume");
    expect(result.stdout).not.toContain("removed=existing-volume");
  });

  it("persists a setup token and prints only the fragment bootstrap link", () => {
    const installer = readFileSync(path.join(publicRoot, "local/scripts/install.sh"), "utf8");
    expect(installer).toContain('ensure_env_value LOCAL_SETUP_TOKEN "$(random_hex 32)"');
    expect(installer).toContain('prepare_private_directory "$SUBBOOST_HOME"');
    expect(installer).toContain('prepare_private_directory "$SUBBOOST_HOME/backups"');
    expect(installer).toContain("/login#setup-token=$(env_value LOCAL_SETUP_TOKEN)");
    expect(installer).not.toContain("?setup-token=");
  });

  it("propagates cron endpoint failures to the container restart policy", () => {
    for (const file of ["local/docker-compose.yml", "local/docker-compose.image.yml"]) {
      const compose = readFileSync(path.join(publicRoot, file), "utf8");
      expect(compose).toContain("LOCAL_SETUP_TOKEN: ${LOCAL_SETUP_TOKEN:?set LOCAL_SETUP_TOKEN}");
      expect(compose).toContain("curl -fsS");
      expect(compose).toContain("failed=1");
      expect(compose).toContain("exit 1");
      expect(compose).not.toContain("|| true");
    }
  });
});
