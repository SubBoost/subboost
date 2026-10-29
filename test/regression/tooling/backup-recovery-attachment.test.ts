import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const old = "#!/usr/bin/env bash\necho old\n";
const fixed = "#!/usr/bin/env bash\necho fixed\n";

function scenario(mode: string) {
  const candidate = mode === "syntax" ? "#!/usr/bin/env bash\nif\n" : fixed;
  const source = readFileSync(path.join(root, "scripts/recovery/repair-backup-upgrade.sh"), "utf8")
    .replace(/^OLD_SHA256=.*$/m, `OLD_SHA256=${hash(old)}`)
    .replace(/^FIXED_SHA256=.*$/m, `FIXED_SHA256=${hash(candidate)}`);
  return spawnSync("bash", ["-lc", 'exec "$BASH" -s'], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, LC_ALL: "C.UTF-8" },
    input: `
set -Eeuo pipefail
home="$(mktemp -d)"
trap 'rm -rf "$home"' EXIT
export SUBBOOST_BIN="$home/subboost"
${mode === "locked" ? 'mkdir "$SUBBOOST_BIN.repair.lock"' : ""}
cat > "$SUBBOOST_BIN" <<'OLD'
${mode === "fixed" ? fixed : mode === "unknown" ? "custom manager\n" : old}OLD
cat > "$home/fixed" <<'FIXED'
${candidate}FIXED
cat > "$home/repair.sh" <<'REPAIR'
${source}
REPAIR
original="$(sha256sum "$SUBBOOST_BIN" | cut -d ' ' -f 1)"
id() { printf '%s\\n' '${mode === "nonroot" ? "1000" : "0"}'; }
curl() {
  ${mode === "download" ? "return 22" : ""}
  local output="\${@: -1}"
  ${mode === "checksum" ? 'printf corrupt > "$output"' : 'cp "$home/fixed" "$output"'}
}
install() {
  local arguments=("$@")
  command install -m 755 -- "\${arguments[\${#arguments[@]}-2]}" "\${arguments[\${#arguments[@]}-1]}"
}
cp() {
  local output="\${@: -1}"
  if [[ "$output" = *.backup-*.partial.* ]] && [ '${mode}' = 'copy' ]; then
    printf partial > "$output"; return 1
  fi
  if [[ "$output" = *.backup-*.partial.* ]] && [ '${mode}' = 'backup-checksum' ]; then
    printf corrupt > "$output"; return 0
  fi
  command cp "$@"
  if [[ "$output" = *.backup-*.partial.* ]] && [ '${mode}' = 'concurrent' ]; then
    printf custom > "$SUBBOOST_BIN"
  fi
}
export -f id curl install cp
export home
if bash "$home/repair.sh"; then status=0; else status=$?; fi
printf 'status=%s\\n' "$status"
after="$(sha256sum "$SUBBOOST_BIN" | cut -d ' ' -f 1)"
if [ "$after" = "$original" ]; then echo original_preserved; fi
if [ "$after" = '${hash(candidate)}' ]; then echo fixed_installed; fi
shopt -s nullglob
backups=("$SUBBOOST_BIN".backup-*)
printf 'backups=%s\\n' "\${#backups[@]}"
if [ "\${#backups[@]}" = 1 ]; then
  [ "$(sha256sum "\${backups[0]}" | cut -d ' ' -f 1)" = "$original" ]
  echo backup_verified
fi
staged=("$SUBBOOST_BIN".repair.*)
printf 'staged=%s\\n' "\${#staged[@]}"
if [ -d "$SUBBOOST_BIN.repair.lock" ]; then echo lock_remains; fi
if [ '${mode}' = concurrent ]; then [ "$(cat "$SUBBOOST_BIN")" = custom ]; echo concurrent_write_preserved; fi
`,
  });
}

describe("standalone backup recovery attachment", () => {
  it("backs up and replaces a known old manager, without running an upgrade", () => {
    const result = scenario("old");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("status=0");
    expect(result.stdout).toContain("fixed_installed");
    expect(result.stdout).toContain("backup_verified");
    expect(result.stdout).toContain("staged=0");
    expect(result.stdout).toContain("Next:");
  });

  it("leaves an already fixed manager unchanged", () => {
    const result = scenario("fixed");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("already installed");
    expect(result.stdout).toContain("original_preserved");
    expect(result.stdout).toContain("backups=0");
  });

  it.each(["unknown", "nonroot", "download", "checksum", "syntax", "copy", "backup-checksum"])("fails closed for %s", (mode) => {
    const result = scenario(mode);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/status=[1-9]/);
    expect(result.stdout).toContain("original_preserved");
    expect(result.stdout).toContain("backups=0");
    expect(result.stdout).toContain("staged=0");
    expect(result.stdout).not.toContain("lock_remains");
  });

  it("preserves a manager changed while its original was being backed up", () => {
    const result = scenario("concurrent");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/status=[1-9]/);
    expect(result.stdout).toContain("concurrent_write_preserved");
    expect(result.stdout).toContain("backup_verified");
    expect(result.stdout).toContain("staged=0");
    expect(result.stdout).not.toContain("lock_remains");
  });

  it("refuses an existing recovery lock and leaves it owned by the other caller", () => {
    const result = scenario("locked");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/status=[1-9]/);
    expect(result.stdout).toContain("original_preserved");
    expect(result.stdout).toContain("backups=0");
    expect(result.stdout).toContain("lock_remains");
  });
});
