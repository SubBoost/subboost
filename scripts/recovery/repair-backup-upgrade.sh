#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Standalone recovery attachment for the v2.10.0 backup-verification failure.
# This file is not part of the normal installer, manager, or asset generator.
OLD_SHA256=e2bdcb22d5b0a086b9560535e2d9194a41d583b22cbf84ed37347a0181c4d79c
FIXED_SHA256=ba721c4ea90fbe391fb0ba8b620087454bdd654e1fde774215365fda001eb623
MANAGER_URL=https://raw.githubusercontent.com/SubBoost/subboost/6a1fff10eb6d5c7a48e0ae4bf76786d594a47675/local/scripts/subboost.sh
work=""
staged=""
backup_partial=""
lock=""
cleanup() {
  [ -z "$work" ] || rm -rf -- "$work"
  [ -z "$staged" ] || rm -f -- "$staged"
  [ -z "$backup_partial" ] || rm -f -- "$backup_partial"
  [ -z "$lock" ] || rmdir -- "$lock"
}

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
file_hash() { sha256sum -- "$1" | cut -d ' ' -f 1; }

main() {
  [ "$(id -u)" = 0 ] || fail "Run this recovery tool as root."
  printf 'Run with no other installation/update command or manager-file editor active.\n'
  local command bin original_hash backup
  for command in curl sha256sum cut bash install mktemp cp mv date mkdir rmdir; do
    command -v "$command" >/dev/null || fail "Required command missing: $command"
  done
  bin="${SUBBOOST_BIN:-/usr/local/bin/subboost}"
  [[ "$bin" = /* ]] || fail "SUBBOOST_BIN must be an absolute path."
  [ -f "$bin" ] && [ ! -L "$bin" ] || fail "Expected a regular installed manager at $bin."
  mkdir -- "${bin}.repair.lock" 2>/dev/null || fail "Another recovery is active or its lock remains. Inspect ${bin}.repair.lock before retrying."
  lock="${bin}.repair.lock"
  trap cleanup EXIT
  original_hash="$(file_hash "$bin")"
  if [ "$original_hash" = "$FIXED_SHA256" ]; then
    printf 'The fixed manager is already installed.\n'
    printf 'Next: %q update\nThen: %q doctor\n' "$bin" "$bin"
    return 0
  fi
  [ "$original_hash" = "$OLD_SHA256" ] || fail "Unrecognized manager; no files changed. Inspect custom or other-version installations manually."
  work="$(mktemp -d)"
  staged=""
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$MANAGER_URL" -o "$work/manager"
  [ "$(file_hash "$work/manager")" = "$FIXED_SHA256" ] || fail "Downloaded manager checksum mismatch; no files changed."
  bash -n "$work/manager" || fail "Downloaded manager syntax check failed; no files changed."
  staged="$(mktemp "${bin}.repair.XXXXXX")"
  install -o 0 -g 0 -m 755 -- "$work/manager" "$staged"
  [ "$(file_hash "$staged")" = "$FIXED_SHA256" ] || fail "Staged manager checksum mismatch."
  [ "$(file_hash "$bin")" = "$original_hash" ] || fail "Installed manager changed during recovery; no replacement performed."
  backup="${bin}.backup-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  [ ! -e "$backup" ] || fail "Backup destination already exists."
  backup_partial="$(mktemp "${backup}.partial.XXXXXX")"
  cp -p -- "$bin" "$backup_partial"
  [ "$(file_hash "$backup_partial")" = "$original_hash" ] || fail "Original manager backup checksum mismatch."
  mv -- "$backup_partial" "$backup"
  backup_partial=""
  [ -f "$bin" ] && [ ! -L "$bin" ] && [ "$(file_hash "$bin")" = "$original_hash" ] || fail "Installed manager changed while backing up; no replacement performed."
  mv -f -- "$staged" "$bin"
  staged=""
  printf 'Manager repaired. Original manager saved at: %s\n' "$backup"
  printf 'Next: %q update\nThen: %q doctor\n' "$bin" "$bin"
}

main "$@"
