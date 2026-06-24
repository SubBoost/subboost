#!/usr/bin/env bash
set -Eeuo pipefail

DEFAULT_HOME="/opt/subboost"
SUBBOOST_HOME="${SUBBOOST_HOME:-$DEFAULT_HOME}"
ENV_FILE="$SUBBOOST_HOME/.env"
COMPOSE_FILE="$SUBBOOST_HOME/docker-compose.yml"
BACKUP_DIR="$SUBBOOST_HOME/backups"
TMP_DIR="${TMPDIR:-/tmp}/subboost-manager.$$"

say() {
  printf '%s\n' "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

is_root() {
  [ "$(id -u)" = "0" ]
}

sudo_do() {
  if is_root; then "$@"; else sudo "$@"; fi
}

install_secret_file() {
  local source="$1"
  local destination="$2"
  sudo_do install -m 600 "$source" "$destination"
  if ! is_root; then
    sudo_do chown "$(id -u):$(id -g)" "$destination"
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

ensure_docker_runner() {
  if [ -z "${DOCKER_RUNNER:-}" ]; then
    DOCKER_RUNNER="$(docker_runner)"
  fi
}

docker_cmd() {
  ensure_docker_runner
  if [ "$DOCKER_RUNNER" = "sudo docker" ]; then sudo docker "$@"; else docker "$@"; fi
}

compose() {
  [ -f "$COMPOSE_FILE" ] || die "Missing $COMPOSE_FILE"
  [ -f "$ENV_FILE" ] || die "Missing $ENV_FILE"
  (cd "$SUBBOOST_HOME" && docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@")
}

load_env() {
  [ -f "$ENV_FILE" ] || die "Missing $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

download_to_temp() {
  local url="$1"
  local output="$2"
  case "$url" in
    file://*) cp "${url#file://}" "$output" ;;
    /*) cp "$url" "$output" ;;
    http://*|https://*) curl -fsSL "$url" -o "$output" ;;
    *) cp "$url" "$output" ;;
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
  sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$file" | head -n 1
}

resolve_url() {
  local base="$1"
  local value="$2"
  [ -n "$value" ] || return 0
  case "$value" in
    http://*|https://*|file://*|/*) printf '%s\n' "$value" ;;
    *)
      case "$base" in
        file://*) printf 'file://%s/%s\n' "$(dirname "${base#file://}")" "$value" ;;
        http://*|https://*) printf '%s/%s\n' "${base%/*}" "$value" ;;
        *) printf '%s/%s\n' "$(dirname "$base")" "$value" ;;
      esac
      ;;
  esac
}

read_env_file() {
  if is_root; then cat "$ENV_FILE"; else sudo cat "$ENV_FILE"; fi
}

write_env_value() {
  local key="$1"
  local value="$2"
  local tmp="$TMP_DIR/env"
  mkdir -p "$TMP_DIR"
  read_env_file | awk -F= -v key="$key" '$1 != key { print }' > "$tmp"
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  install_secret_file "$tmp" "$ENV_FILE"
}

install_file_from_url() {
  local url="$1"
  local destination="$2"
  local mode="$3"
  local tmp="$TMP_DIR/download"
  mkdir -p "$TMP_DIR"
  download_to_temp "$url" "$tmp"
  sudo_do install -m "$mode" "$tmp" "$destination"
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

service_container_id() {
  compose ps -q "$1" 2>/dev/null | head -n 1 || true
}

container_state() {
  local container_id="$1"
  [ -n "$container_id" ] || return 0
  docker_cmd inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || true
}

container_health() {
  local container_id="$1"
  [ -n "$container_id" ] || return 0
  docker_cmd inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_id" 2>/dev/null || true
}

service_status_text() {
  local service="$1"
  local container_id state health
  container_id="$(service_container_id "$service")"
  if [ -z "$container_id" ]; then
    printf '未创建\n'
    return 0
  fi

  state="$(container_state "$container_id")"
  case "$state" in
    running)
      if [ "$service" = "db" ]; then
        health="$(container_health "$container_id")"
        case "$health" in
          healthy) printf '运行中，健康\n' ;;
          starting) printf '运行中，健康检查中\n' ;;
          unhealthy) printf '运行中，未健康\n' ;;
          *) printf '运行中\n' ;;
        esac
      else
        printf '运行中\n'
      fi
      ;;
    exited) printf '已停止\n' ;;
    restarting) printf '正在重启\n' ;;
    dead) printf '异常停止\n' ;;
    *) printf '%s\n' "${state:-未知}" ;;
  esac
}

health_status_text() {
  health_status_label "$(health_status_code)"
}

health_status_code() {
  local port base
  port="$(port_number "${SUBBOOST_PORT:-3000}")"
  base="http://127.0.0.1:$port"
  if ! command -v curl >/dev/null 2>&1; then
    printf 'curl-missing\n'
  elif curl -fsS "$base/api/health/live" >/dev/null 2>&1 && curl -fsS "$base/api/health/ready" >/dev/null 2>&1; then
    printf 'ok\n'
  elif curl -fsS "$base/api/health/live" >/dev/null 2>&1; then
    printf 'not-ready\n'
  else
    printf 'unhealthy\n'
  fi
}

health_status_label() {
  case "$1" in
    ok) printf '正常\n' ;;
    not-ready) printf '应用已启动，数据库未就绪\n' ;;
    curl-missing) printf '缺少 curl\n' ;;
    *) printf '异常\n' ;;
  esac
}

wait_for_health() {
  local attempts="${SUBBOOST_DOCTOR_HEALTH_ATTEMPTS:-15}"
  local interval="${SUBBOOST_DOCTOR_HEALTH_INTERVAL_SECONDS:-2}"
  local index status
  for index in $(seq 1 "$attempts"); do
    status="$(health_status_code)"
    if [ "$status" = "ok" ]; then
      return 0
    fi
    if [ "$index" != "$attempts" ]; then
      sleep "$interval"
    fi
  done
  return 1
}

doctor_health_failure_message() {
  local status="$1"
  case "$status" in
    not-ready) printf 'Health check failed: database is not ready.' ;;
    curl-missing) printf 'Health check failed: curl command is missing.' ;;
    *) printf 'Health check failed: app is not responding.' ;;
  esac
}

status_cmd() {
  load_env
  say "SubBoost 状态"
  say "访问地址: ${APP_URL:-未配置}"
  say "安装目录: $SUBBOOST_HOME"
  say ""
  say "服务状态:"
  say "应用: $(service_status_text app)"
  say "数据库: $(service_status_text db)"
  say "定时任务: $(service_status_text cron)"
  say ""
  say "健康检查: $(health_status_text)"
  say "备份目录: $BACKUP_DIR"
  say ""
  say "常用命令: subboost logs / subboost backup / subboost update / subboost restart / subboost doctor"
}

update_cmd() {
  load_env
  local release_url="${SUBBOOST_RELEASE_URL:-}"
  local release_file="$TMP_DIR/release.json"
  local image compose_url manager_url
  mkdir -p "$TMP_DIR"
  if [ -n "$release_url" ] && download_to_temp "$release_url" "$release_file" 2>/dev/null; then
    image="$(json_get image "$release_file" || true)"
    compose_url="$(resolve_url "$release_url" "$(json_get composeUrl "$release_file" || true)")"
    manager_url="$(resolve_url "$release_url" "$(json_get managerUrl "$release_file" || true)")"
    if [ -n "$image" ]; then write_env_value SUBBOOST_IMAGE "$image"; fi
    if [ -n "$compose_url" ]; then
      install_file_from_url "$compose_url" "$COMPOSE_FILE" 644
      write_env_value SUBBOOST_COMPOSE_URL "$compose_url"
    fi
    if [ -n "$manager_url" ]; then
      install_file_from_url "$manager_url" "${SUBBOOST_BIN:-/usr/local/bin/subboost}" 755
      write_env_value SUBBOOST_MANAGER_URL "$manager_url"
    fi
  else
    say "Release manifest unavailable; updating current image and compose only."
  fi
  compose pull
  compose up -d --remove-orphans
  compose up -d --no-deps --force-recreate app
  if ! wait_for_health; then
    local health_status
    health_status="$(health_status_code)"
    status_cmd
    die "$(doctor_health_failure_message "$health_status")"
  fi
  status_cmd
}

logs_cmd() {
  compose logs -f --tail="${SUBBOOST_LOG_TAIL:-200}" "$@"
}

backup_cmd() {
  load_env
  sudo_do mkdir -p "$BACKUP_DIR"
  local stamp db_tmp db_out env_out
  local -a sql_backups env_backups
  local i
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  db_tmp="$BACKUP_DIR/subboost-$stamp.sql.gz.partial"
  db_out="$BACKUP_DIR/subboost-$stamp.sql.gz"
  env_out="$BACKUP_DIR/subboost-$stamp.env"
  compose exec -T db pg_dump -U "${POSTGRES_USER:-subboost}" -d "${POSTGRES_DB:-subboost}" | gzip -c | sudo_do tee "$db_tmp" >/dev/null
  sudo_do mv "$db_tmp" "$db_out"
  sudo_do install -m 600 "$ENV_FILE" "$env_out"

  shopt -s nullglob
  sql_backups=("$BACKUP_DIR"/subboost-*.sql.gz)
  env_backups=("$BACKUP_DIR"/subboost-*.env)
  shopt -u nullglob

  for ((i = 0; i < ${#sql_backups[@]} - 10; i++)); do
    sudo_do rm -f -- "${sql_backups[$i]}"
  done
  for ((i = 0; i < ${#env_backups[@]} - 10; i++)); do
    sudo_do rm -f -- "${env_backups[$i]}"
  done
  say "Backup written:"
  say "  $db_out"
  say "  $env_out"
}

restart_cmd() {
  compose up -d --remove-orphans
  compose up -d --no-deps --force-recreate app
  status_cmd
}

doctor_cmd() {
  command -v docker >/dev/null 2>&1 || die "docker command is missing"
  docker_cmd compose version >/dev/null 2>&1 || die "docker compose plugin is missing"
  [ -d "$SUBBOOST_HOME" ] || die "Missing $SUBBOOST_HOME"
  [ -f "$ENV_FILE" ] || die "Missing $ENV_FILE"
  [ -f "$COMPOSE_FILE" ] || die "Missing $COMPOSE_FILE"
  load_env
  for key in SUBBOOST_IMAGE POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DATABASE_URL ENCRYPTION_KEY JWT_SECRET CRON_SECRET APP_URL SUBBOOST_PORT; do
    grep -q "^$key=" "$ENV_FILE" || die "Missing $key in $ENV_FILE"
  done
  compose config >/dev/null
  if ! wait_for_health; then
    local health_status
    health_status="$(health_status_code)"
    status_cmd
    die "$(doctor_health_failure_message "$health_status")"
  fi
  status_cmd
  say "Doctor: OK"
}

menu_cmd() {
  say "SubBoost"
  say "1) Status"
  say "2) Update"
  say "3) Logs"
  say "4) Backup"
  say "5) Restart"
  say "6) Doctor"
  say "0) Exit"
  local choice=""
  if [ -t 0 ]; then
    printf 'Choose: '
    IFS= read -r choice || choice=""
  fi
  case "$choice" in
    1) status_cmd ;;
    2) update_cmd ;;
    3) logs_cmd ;;
    4) backup_cmd ;;
    5) restart_cmd ;;
    6) doctor_cmd ;;
    0|"") exit 0 ;;
    *) die "Unknown menu choice: $choice" ;;
  esac
}

main() {
  local command="${1:-menu}"
  if [ "$#" -gt 0 ]; then shift; fi
  case "$command" in
    menu) menu_cmd ;;
    status) status_cmd ;;
    update) update_cmd ;;
    logs) logs_cmd "$@" ;;
    backup) backup_cmd ;;
    restart) restart_cmd ;;
    doctor) doctor_cmd ;;
    *) die "Unknown command: $command" ;;
  esac
}

if [ "${SUBBOOST_SCRIPT_SOURCE_ONLY:-0}" != "1" ]; then
  trap 'rm -rf "$TMP_DIR"' EXIT
  DOCKER_RUNNER=""
  main "$@"
fi
