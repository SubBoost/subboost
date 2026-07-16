#!/usr/bin/env bash
set -Eeuo pipefail

DEFAULT_HOME="/opt/subboost"
DEFAULT_BIN="/usr/local/bin/subboost"
DEFAULT_RELEASE_URL="https://github.com/SubBoost/subboost/releases/latest/download/release.json"
DEFAULT_UPDATE_RELEASE_URL="https://github.com/SubBoost/subboost/releases/latest/download/release.json"
DEFAULT_COMPOSE_URL="https://github.com/SubBoost/subboost/releases/latest/download/docker-compose.image.yml"
DEFAULT_MANAGER_URL="https://github.com/SubBoost/subboost/releases/latest/download/subboost-manager"
DEFAULT_IMAGE="ghcr.io/subboost/subboost:latest"

SUBBOOST_HOME="${SUBBOOST_HOME:-$DEFAULT_HOME}"
SUBBOOST_BIN="${SUBBOOST_BIN:-$DEFAULT_BIN}"
SUBBOOST_RELEASE_URL="${SUBBOOST_RELEASE_URL:-$DEFAULT_RELEASE_URL}"
SUBBOOST_UPDATE_RELEASE_URL="${SUBBOOST_UPDATE_RELEASE_URL:-$DEFAULT_UPDATE_RELEASE_URL}"
SUBBOOST_ASSUME_YES="${SUBBOOST_ASSUME_YES:-0}"
SUBBOOST_DRY_RUN="${SUBBOOST_DRY_RUN:-0}"

ENV_FILE="$SUBBOOST_HOME/.env"
COMPOSE_FILE="$SUBBOOST_HOME/docker-compose.yml"
TMP_DIR="${TMPDIR:-/tmp}/subboost-install.$$"
RELEASE_FILE="$TMP_DIR/release.json"

say() {
  printf '%s\n' "$*"
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

is_root() {
  [ "$(id -u)" = "0" ]
}

sudo_do() {
  if is_root; then
    "$@"
  else
    command -v sudo >/dev/null 2>&1 || die "sudo is required when the installer is not run as root."
    sudo "$@"
  fi
}

run_root() {
  if [ "$SUBBOOST_DRY_RUN" = "1" ]; then
    printf '[dry-run] root:'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  sudo_do "$@"
}

prepare_private_directory() {
  local directory="$1"
  run_root mkdir -p "$directory"
  run_root chmod 700 "$directory"
  if ! is_root; then run_root chown "$(id -u):$(id -g)" "$directory"; fi
}

install_secret_file() {
  local source="$1"
  local destination="$2"
  run_root install -m 600 "$source" "$destination"
  if ! is_root; then
    run_root chown "$(id -u):$(id -g)" "$destination"
  fi
}

prompt() {
  local message="$1"
  local default_value="${2:-}"
  local answer=""
  if [ "$SUBBOOST_ASSUME_YES" = "1" ]; then
    printf '%s\n' "$default_value"
    return 0
  fi
  if { exec 3<>/dev/tty; } 2>/dev/null; then
    if [ -t 3 ] && printf '%s' "$message" >&3 2>/dev/null; then
      IFS= read -r answer <&3 2>/dev/null || answer=""
      printf '\n' >&3 2>/dev/null || true
    fi
    exec 3>&-
  fi
  if [ -n "$answer" ]; then printf '%s\n' "$answer"; else printf '%s\n' "$default_value"; fi
}

confirm_or_quit() {
  local message="$1"
  local answer
  answer="$(prompt "$message" "")"
  case "$answer" in
    q|Q) exit 0 ;;
  esac
}

require_linux() {
  [ "$(uname -s)" = "Linux" ] || die "This installer only supports Linux servers."
}

require_curl() {
  command -v curl >/dev/null 2>&1 || die "curl is required. Install curl and run this installer again."
}

download_to_temp() {
  local url="$1"
  local output="$2"
  case "$url" in
    file://*)
      cp "${url#file://}" "$output"
      ;;
    /*)
      cp "$url" "$output"
      ;;
    http://*|https://*)
      curl -fsSL "$url" -o "$output"
      ;;
    *)
      cp "$url" "$output"
      ;;
  esac
}

json_get() {
  local key="$1"
  local file="$2"
  if [ ! -s "$file" ]; then return 0; fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$key" "$file" <<'PY'
import json
import sys
key, path = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as handle:
    data = json.load(handle)
value = data.get(key, "")
print("" if value is None else str(value))
PY
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    node - "$key" "$file" <<'NODE'
const fs = require("node:fs");
const [key, file] = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(file, "utf8"))[key] ?? "";
process.stdout.write(String(value));
NODE
    return 0
  fi
  sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$file" | head -n 1
}

resolve_url() {
  local base="$1"
  local value="$2"
  [ -n "$value" ] || return 0
  case "$value" in
    http://*|https://*|file://*|/*)
      printf '%s\n' "$value"
      ;;
    *)
      case "$base" in
        file://*)
          printf 'file://%s/%s\n' "$(dirname "${base#file://}")" "$value"
          ;;
        http://*|https://*)
          printf '%s/%s\n' "${base%/*}" "$value"
          ;;
        *)
          printf '%s/%s\n' "$(dirname "$base")" "$value"
          ;;
      esac
      ;;
  esac
}

fetch_release_manifest() {
  mkdir -p "$TMP_DIR"
  if download_to_temp "$SUBBOOST_RELEASE_URL" "$RELEASE_FILE" 2>/dev/null; then
    return 0
  fi
  warn "Release manifest was not reachable; using installer defaults and environment overrides."
  : > "$RELEASE_FILE"
}

random_hex() {
  local bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    dd if=/dev/urandom bs="$bytes" count=1 2>/dev/null | od -An -tx1 | tr -d ' \n'
  fi
}

port_number() {
  local value="$1"
  case "$value" in
    *:*) value="${value##*:}" ;;
  esac
  value="${value#[}"
  value="${value%]}"
  printf '%s\n' "$value"
}

port_is_number() {
  local port
  port="$(port_number "$1")"
  case "$port" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$port" -ge 1 ] && [ "$port" -le 65535 ]
}

port_is_free() {
  local port
  port="$(port_number "$1")"
  port_is_number "$port" || return 1

  if command -v ss >/dev/null 2>&1; then
    if ss -H -ltn 2>/dev/null | awk -v port="$port" '{ if ($4 ~ ":" port "$") found = 1 } END { exit found ? 0 : 1 }'; then
      return 1
    fi
    return 0
  fi

  if command -v netstat >/dev/null 2>&1; then
    if netstat -ltn 2>/dev/null | awk -v port="$port" 'NR > 2 { if ($4 ~ ":" port "$") found = 1 } END { exit found ? 0 : 1 }'; then
      return 1
    fi
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
checks = [(socket.AF_INET, "0.0.0.0")]
if socket.has_ipv6:
    checks.append((socket.AF_INET6, "::"))

for family, host in checks:
    sock = socket.socket(family, socket.SOCK_STREAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
    except OSError:
        sys.exit(1)
    finally:
        sock.close()
PY
    return $?
  fi

  return 0
}

random_port_candidate() {
  if command -v shuf >/dev/null 2>&1; then
    shuf -i 30000-39999 -n 1
    return 0
  fi
  printf '%s\n' "$((0x$(random_hex 2) % 10000 + 30000))"
}

random_free_port() {
  local index candidate
  for index in $(seq 1 80); do
    candidate="$(random_port_candidate)"
    if port_is_free "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  for candidate in $(seq 30000 39999); do
    if port_is_free "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  die "没有找到 30000-39999 范围内的空闲端口。"
}

read_env_file() {
  if [ ! -f "$ENV_FILE" ]; then return 0; fi
  if is_root; then cat "$ENV_FILE"; else sudo cat "$ENV_FILE"; fi
}

env_value() {
  local key="$1"
  read_env_file | awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }'
}

write_env_value() {
  local key="$1"
  local value="$2"
  local tmp="$TMP_DIR/env"
  mkdir -p "$TMP_DIR"
  if [ -f "$ENV_FILE" ]; then
    read_env_file | awk -v key="$key" 'index($0, key "=") != 1 { print }' > "$tmp"
  else
    : > "$tmp"
  fi
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  install_secret_file "$tmp" "$ENV_FILE"
}

ensure_env_value() {
  local key="$1"
  local value="$2"
  local current
  current="$(env_value "$key" || true)"
  if [ -z "$current" ]; then
    write_env_value "$key" "$value"
  fi
}

set_env_value() {
  write_env_value "$1" "$2"
}

ensure_scheme() {
  local url="$1"
  case "$url" in
    http://*|https://*) printf '%s\n' "$url" ;;
    *) printf 'http://%s\n' "$url" ;;
  esac
}

url_has_port() {
  printf '%s' "$1" | grep -Eq '^https?://\[[^]]+\]:[0-9]+($|/)|^https?://[^/]+:[0-9]+($|/)'
}

url_without_port() {
  local url
  url="$(ensure_scheme "$1")"
  url="${url%/}"
  if printf '%s' "$url" | grep -Eq '^https?://\[[^]]+\]:[0-9]+$'; then
    printf '%s\n' "$url" | sed -E 's#^(https?://\[[^]]+\]):[0-9]+$#\1#'
  elif printf '%s' "$url" | grep -Eq '^https?://[^/]+:[0-9]+$'; then
    printf '%s\n' "$url" | sed -E 's#^(https?://[^/:]+):[0-9]+$#\1#'
  else
    printf '%s\n' "$url"
  fi
}

normalize_app_url() {
  local url
  local port="$2"
  url="$(ensure_scheme "$1")"
  url="${url%/}"
  if url_has_port "$url" || [ "$port" = "80" ] || [ "$port" = "443" ]; then
    printf '%s\n' "$url"
  else
    printf '%s:%s\n' "$url" "$port"
  fi
}

detect_public_host() {
  local detected=""
  detected="$(curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null || true)"
  if [ -z "$detected" ]; then
    detected="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  if [ -z "$detected" ]; then detected="localhost"; fi
  printf '%s\n' "$detected"
}

install_docker_engine() {
  confirm_or_quit "Docker is missing. Press Enter to install Docker automatically, or type q to exit: "
  require_curl
  local script="$TMP_DIR/get-docker.sh"
  mkdir -p "$TMP_DIR"
  curl -fsSL https://get.docker.com -o "$script"
  run_root sh "$script"
  if command -v systemctl >/dev/null 2>&1; then
    run_root systemctl enable --now docker || true
  else
    run_root service docker start || true
  fi
}

install_compose_plugin() {
  confirm_or_quit "Docker Compose plugin is missing. Press Enter to install it automatically, or type q to exit: "
  if command -v apt-get >/dev/null 2>&1; then
    run_root apt-get update
    run_root apt-get install -y docker-compose-plugin
  elif command -v dnf >/dev/null 2>&1; then
    run_root dnf install -y docker-compose-plugin
  elif command -v yum >/dev/null 2>&1; then
    run_root yum install -y docker-compose-plugin
  else
    install_docker_engine
  fi
}

docker_runner() {
  if docker info >/dev/null 2>&1; then
    printf 'docker\n'
    return 0
  fi
  if ! is_root && command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    printf 'sudo docker\n'
    return 0
  fi
  printf 'docker\n'
}

docker_cmd() {
  if [ "$DOCKER_RUNNER" = "sudo docker" ]; then
    if [ -n "${DOCKER_CONFIG:-}" ]; then
      sudo env "DOCKER_CONFIG=$DOCKER_CONFIG" docker "$@"
    else
      sudo docker "$@"
    fi
  else
    docker "$@"
  fi
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    install_docker_engine
  fi
  DOCKER_RUNNER="$(docker_runner)"
  if ! docker_cmd info >/dev/null 2>&1; then
    if command -v systemctl >/dev/null 2>&1; then run_root systemctl start docker || true; fi
  fi
  DOCKER_RUNNER="$(docker_runner)"
  docker_cmd info >/dev/null 2>&1 || die "Docker is installed but not usable by this shell. Check Docker daemon and permissions."
  if ! docker_cmd compose version >/dev/null 2>&1; then
    install_compose_plugin
  fi
  docker_cmd compose version >/dev/null 2>&1 || die "Docker Compose plugin is still unavailable."
}

docker_login_if_needed() {
  if [ -n "${SUBBOOST_REGISTRY_USER:-}" ] && [ -n "${SUBBOOST_REGISTRY_TOKEN:-}" ]; then
    printf '%s' "$SUBBOOST_REGISTRY_TOKEN" | docker_cmd login ghcr.io -u "$SUBBOOST_REGISTRY_USER" --password-stdin >/dev/null
  fi
}

compose() {
  (cd "$SUBBOOST_HOME" && docker_cmd compose --project-directory "$SUBBOOST_HOME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@")
}

subboost_app_container_id() {
  [ -f "$COMPOSE_FILE" ] || return 0
  [ -f "$ENV_FILE" ] || return 0
  compose ps -q app 2>/dev/null | head -n 1 || true
}

container_publishes_port() {
  local container_id="$1"
  local port
  port="$(port_number "$2")"
  [ -n "$container_id" ] || return 1
  docker_cmd port "$container_id" 3000/tcp 2>/dev/null | awk -v port="$port" '{ if ($0 ~ ":" port "$") found = 1 } END { exit found ? 0 : 1 }'
}

port_owned_by_subboost() {
  local port container_id
  port="$(port_number "$1")"
  port_is_number "$port" || return 1
  container_id="$(subboost_app_container_id)"
  container_publishes_port "$container_id" "$port"
}

port_can_be_used() {
  local port
  port="$(port_number "$1")"
  port_is_number "$port" || return 1
  port_is_free "$port" || port_owned_by_subboost "$port"
}

recommended_port_from() {
  local current_port
  current_port="$(port_number "${1:-}")"
  if port_can_be_used "$current_port"; then
    printf '%s\n' "$current_port"
    return 0
  fi
  random_free_port
}

prompt_for_port() {
  local recommended_port answer port
  recommended_port="$1"
  while true; do
    answer="$(prompt "请输入端口，直接回车会自动选择一个可用端口 [自动选择]: " "$recommended_port")"
    port="$(port_number "$answer")"
    if ! port_is_number "$port"; then
      warn "端口格式不正确，请输入 1-65535 之间的数字。"
      recommended_port="$(random_free_port)"
      continue
    fi
    if port_can_be_used "$port"; then
      printf '%s\n' "$port"
      return 0
    fi
    warn "端口已被占用: $port"
    recommended_port="$(random_free_port)"
  done
}

wait_for_health() {
  local port="$1"
  local base="http://127.0.0.1:$(port_number "$port")"
  local index
  for index in $(seq 1 60); do
    if curl -fsS "$base/api/health/live" >/dev/null 2>&1 && curl -fsS "$base/api/health/ready" >/dev/null 2>&1; then
      return 0
    fi
    if [ "$((index % 10))" = "0" ]; then
      say "SubBoost 还在启动中，继续等待..."
    fi
    sleep 2
  done
  warn "SubBoost 启动超时，健康检查没有通过。"
  warn "请稍后运行 'subboost logs' 查看完整日志。"
  warn "最近的 app 日志如下："
  compose logs --tail=80 app >&2 || true
  return 1
}

cleanup_failed_install() {
  local volumes_before="$1"
  local project_name
  project_name="$(basename "$SUBBOOST_HOME")"
  compose down --remove-orphans >/dev/null 2>&1 || true
  while IFS= read -r volume; do
    [ -n "$volume" ] || continue
    if ! grep -Fxq "$volume" "$volumes_before"; then
      docker_cmd volume rm "$volume" >/dev/null 2>&1 || true
    fi
  done < <(docker_cmd volume ls -q --filter "label=com.docker.compose.project=$project_name" 2>/dev/null || true)
}

commit_candidate_install() {
  local candidate_env="$1" candidate_compose="$2" candidate_manager="$3"
  local live_env="$4" live_compose="$5"
  local staged_env="${live_env}.candidate.$$"
  local staged_compose="${live_compose}.candidate.$$"
  local staged_manager="${SUBBOOST_BIN}.candidate.$$"
  run_root install -m 600 "$candidate_env" "$staged_env" || return 1
  if ! is_root; then run_root chown "$(id -u):$(id -g)" "$staged_env" || return 1; fi
  run_root install -m 644 "$candidate_compose" "$staged_compose" || return 1
  run_root install -m 755 "$candidate_manager" "$staged_manager" || return 1
  run_root mv -f "$staged_env" "$live_env" || return 1
  run_root mv -f "$staged_compose" "$live_compose" || return 1
  run_root mv -f "$staged_manager" "$SUBBOOST_BIN" || return 1
}

main() {
  require_linux
  require_curl
  local live_env="$ENV_FILE"
  local live_compose="$COMPOSE_FILE"
  if [ -e "$live_env" ] || [ -e "$live_compose" ]; then
    die "Existing installation metadata was found. Use 'subboost update' or inspect the incomplete installation before retrying."
  fi
  fetch_release_manifest

  local manifest_image manifest_compose manifest_manager manifest_version
  manifest_image="$(json_get image "$RELEASE_FILE" || true)"
  manifest_compose="$(json_get composeUrl "$RELEASE_FILE" || true)"
  manifest_manager="$(json_get managerUrl "$RELEASE_FILE" || true)"
  manifest_version="$(json_get version "$RELEASE_FILE" || true)"

  local image compose_url manager_url
  image="${SUBBOOST_IMAGE:-${manifest_image:-$DEFAULT_IMAGE}}"
  compose_url="${SUBBOOST_COMPOSE_URL:-$(resolve_url "$SUBBOOST_RELEASE_URL" "${manifest_compose:-$DEFAULT_COMPOSE_URL}")}"
  manager_url="${SUBBOOST_MANAGER_URL:-$(resolve_url "$SUBBOOST_RELEASE_URL" "${manifest_manager:-$DEFAULT_MANAGER_URL}")}"
  [ -n "$image" ] && [ -n "$compose_url" ] && [ -n "$manager_url" ] || die "Release metadata is missing image, composeUrl, or managerUrl."

  say "Installing SubBoost."
  say "Install directory: $SUBBOOST_HOME"
  if [ -n "$manifest_version" ]; then say "Version: $manifest_version"; fi

  if [ "$SUBBOOST_DRY_RUN" = "1" ]; then
    say "[dry-run] image=$image"
    say "[dry-run] composeUrl=$compose_url"
    say "[dry-run] managerUrl=$manager_url"
    say "[dry-run] updateReleaseUrl=$SUBBOOST_UPDATE_RELEASE_URL"
    exit 0
  fi

  ensure_docker
  docker_login_if_needed
  prepare_private_directory "$SUBBOOST_HOME"
  prepare_private_directory "$SUBBOOST_HOME/backups"
  run_root mkdir -p "$(dirname "$SUBBOOST_BIN")"
  ENV_FILE="$TMP_DIR/candidate.env"
  COMPOSE_FILE="$TMP_DIR/candidate-compose.yml"
  local candidate_manager="$TMP_DIR/candidate-manager"
  local volumes_before="$TMP_DIR/volumes.before"
  umask 077
  : > "$ENV_FILE"
  download_to_temp "$compose_url" "$COMPOSE_FILE"
  download_to_temp "$manager_url" "$candidate_manager"
  [ -s "$COMPOSE_FILE" ] || die "Candidate Compose file is empty."
  [ -s "$candidate_manager" ] && bash -n "$candidate_manager" || die "Candidate manager is invalid."

  set_env_value SUBBOOST_IMAGE "$image"
  set_env_value SUBBOOST_RELEASE_URL "$SUBBOOST_UPDATE_RELEASE_URL"
  set_env_value SUBBOOST_COMPOSE_URL "$compose_url"
  set_env_value SUBBOOST_MANAGER_URL "$manager_url"
  ensure_env_value POSTGRES_DB "subboost"
  ensure_env_value POSTGRES_USER "subboost"
  ensure_env_value POSTGRES_PASSWORD "$(random_hex 18)"
  ensure_env_value ENCRYPTION_KEY "$(random_hex 32)"
  ensure_env_value JWT_SECRET "$(random_hex 32)"
  ensure_env_value CRON_SECRET "$(random_hex 32)"
  ensure_env_value LOCAL_SETUP_TOKEN "$(random_hex 32)"

  local db_name db_user db_pass database_url current_url current_port default_host default_url input_url selected_port final_url recommended_port
  db_name="$(env_value POSTGRES_DB)"
  db_user="$(env_value POSTGRES_USER)"
  db_pass="$(env_value POSTGRES_PASSWORD)"
  database_url="postgresql://$db_user:$db_pass@db:5432/$db_name?schema=public"
  ensure_env_value DATABASE_URL "$database_url"

  current_port="${SUBBOOST_PORT:-$(env_value SUBBOOST_PORT || true)}"
  current_url="${APP_URL:-$(env_value APP_URL || true)}"

  default_host="$(detect_public_host)"
  if [ -n "$current_url" ]; then
    default_url="$(url_without_port "$current_url")"
  else
    default_url="http://$default_host"
  fi
  recommended_port="$(recommended_port_from "$current_port")"
  input_url="$(prompt "请输入 SubBoost 访问地址，直接回车会自动填入服务器 ip [$default_url]: " "$default_url")"
  selected_port="$(prompt_for_port "$recommended_port")"
  final_url="$(normalize_app_url "$(url_without_port "$input_url")" "$selected_port")"
  set_env_value SUBBOOST_PORT "$selected_port"
  set_env_value APP_URL "$final_url"

  compose config >/dev/null
  local services
  services="$(compose config --services)"
  for service in app db cron; do
    printf '%s\n' "$services" | grep -Fxq "$service" || die "Candidate Compose is missing service: $service"
  done
  docker_cmd volume ls -q > "$volumes_before"
  say "Pulling SubBoost image before creating containers..."
  compose pull
  say "Starting SubBoost..."
  if ! compose up -d db app || ! wait_for_health "$(env_value SUBBOOST_PORT)" || ! compose up -d cron; then
    cleanup_failed_install "$volumes_before"
    die "New installation failed; only resources created by this run were cleaned up."
  fi
  if ! commit_candidate_install "$ENV_FILE" "$COMPOSE_FILE" "$candidate_manager" "$live_env" "$live_compose"; then
    cleanup_failed_install "$volumes_before"
    run_root rm -f "$live_env" "$live_compose" "${live_env}.candidate.$$" "${live_compose}.candidate.$$" "${SUBBOOST_BIN}.candidate.$$"
    die "Failed to atomically install candidate metadata."
  fi
  ENV_FILE="$live_env"
  COMPOSE_FILE="$live_compose"

  say ""
  say "SubBoost 已启动。"
  say "访问地址: $(env_value APP_URL)"
  say "首次初始化链接: $(env_value APP_URL)/login#setup-token=$(env_value LOCAL_SETUP_TOKEN)"
  say "请通过上面的链接创建第一个管理员；初始化成功后页面会清除令牌片段。"
  say "管理命令: subboost"
  say "重要提醒: 请把 $ENV_FILE 和数据库备份一起保存好。"
}

if [ "${SUBBOOST_SCRIPT_SOURCE_ONLY:-0}" != "1" ]; then
  trap 'rm -rf "$TMP_DIR"' EXIT
  DOCKER_RUNNER="docker"
  main "$@"
fi
