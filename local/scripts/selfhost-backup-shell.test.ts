import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const publicRoot = path.resolve(__dirname, "../..");

function runBackupScenario(failure: "none" | "verify" | "read" | "dump" | "write" | "empty" | "drain") {
  return spawnSync("bash", ["-lc", "exec \"$BASH\" -s"], {
    cwd: publicRoot,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, LC_ALL: "C.UTF-8" },
    input: `
      set -Eeuo pipefail
      home="$(mktemp -d)"
      trap 'rm -rf "$home"' EXIT
      export SUBBOOST_SCRIPT_SOURCE_ONLY=1 SUBBOOST_HOME="$home"
      source local/scripts/subboost.sh
      failure="${failure}"
      sudo_do() {
        if [ "$1" = "cat" ] && [ "$failure" = "read" ]; then return 29; fi
        if [ "$1" = "tee" ] && [ "$failure" = "write" ]; then return 37; fi
        "$@"
      }
      cat() {
        if [ "$#" -eq 0 ] && [ "$failure" = "drain" ]; then return 31; fi
        command cat "$@"
      }
      compose() {
        case "$*" in
          *"pg_dump -Fc"*)
            if [ "$failure" != "empty" ]; then
              dd if=/dev/zero bs=1048576 count=2 2>/dev/null
            fi
            if [ "$failure" = "dump" ]; then return 23; fi
            ;;
          *"pg_restore --list"*)
            head -c 16 >/dev/null
            if [ "$failure" = "verify" ]; then return 17; fi
            ;;
          *) return 99 ;;
        esac
      }
      output="$home/backup.dump"
      if create_verified_dump "$output"; then status=0; else status=$?; fi
      printf 'status=%s\\n' "$status"
      if [ -f "$output" ]; then
        printf 'output_bytes=%s\\n' "$(wc -c < "$output" | tr -d '[:space:]')"
      fi
      if [ -e "$output.partial" ]; then printf 'partial_exists\\n'; fi
    `,
  });
}

describe("self-host backup verification", () => {
  it("accepts a large dump when the directory verifier reads only a prefix", () => {
    const result = runBackupScenario("none");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("status=0");
    expect(result.stdout).toContain("output_bytes=2097152");
    expect(result.stdout).not.toContain("partial_exists");
    expect(result.stdout).not.toContain("Backup verification failed");
  });

  it.each([
    ["verify", "verify=17"],
    ["read", "read=29"],
    ["dump", "pg_dump=23"],
    ["write", "write=37"],
    ["empty", "Backup failed"],
    ["drain", "verify=1"],
  ] as const)("rejects %s failures and removes the partial dump", (failure, message) => {
    const result = runBackupScenario(failure);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("status=1");
    expect(result.stdout).toContain(message);
    expect(result.stdout).not.toContain("output_bytes=");
    expect(result.stdout).not.toContain("partial_exists");
  });
});
