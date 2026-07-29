#!/usr/bin/env bash
set -Eeuo pipefail

# A small Prometheus-text snapshot for an existing monitoring agent or cron
# collector. It contains no mailbox, external identifier, credential or URL.

DATA_DIR="${NFQ_DATA_DIR:-/var/lib/nf-query}"
BACKUP_DIR="${NFQ_BACKUP_DIR:-/var/backups/nf-query/weekly}"

service_up() {
    local unit="$1"
    local value=0
    if systemctl is-active --quiet "$unit" 2>/dev/null; then value=1; fi
    printf 'nf_query_service_up{unit="%s"} %d\n' "$unit" "$value"
}

service_memory() {
    local unit="$1"
    local value
    value="$(systemctl show --property=MemoryCurrent --value "$unit" 2>/dev/null || true)"
    if [[ "$value" =~ ^[0-9]+$ ]]; then
        printf 'nf_query_service_memory_bytes{unit="%s"} %s\n' "$unit" "$value"
    fi
}

service_restarts() {
    local unit="$1"
    local value
    value="$(systemctl show --property=NRestarts --value "$unit" 2>/dev/null || true)"
    if [[ "$value" =~ ^[0-9]+$ ]]; then
        printf 'nf_query_service_restarts_total{unit="%s"} %s\n' "$unit" "$value"
    fi
}

printf '# HELP nf_query_service_up Whether a systemd service is active.\n'
printf '# TYPE nf_query_service_up gauge\n'
service_up nf-query-public.service
service_up nf-query-admin.service
service_up nf-query-backup.timer

printf '# HELP nf_query_service_memory_bytes Current systemd cgroup memory.\n'
printf '# TYPE nf_query_service_memory_bytes gauge\n'
service_memory nf-query-public.service
service_memory nf-query-admin.service

printf '# HELP nf_query_service_restarts_total Number of systemd automatic restarts.\n'
printf '# TYPE nf_query_service_restarts_total counter\n'
service_restarts nf-query-public.service
service_restarts nf-query-admin.service

latest_backup="$(find "$BACKUP_DIR" -maxdepth 1 -type f \
    -name 'bindings-*.sqlite' -printf '%T@ %p\n' 2>/dev/null | \
    sort -rn | head -n 1 || true)"
if [[ -n "$latest_backup" ]]; then
    backup_epoch="${latest_backup%%.*}"
    backup_age="$(( $(date +%s) - backup_epoch ))"
else
    backup_age=-1
fi
printf '# HELP nf_query_backup_age_seconds Age of the newest weekly backup; -1 means absent.\n'
printf '# TYPE nf_query_backup_age_seconds gauge\n'
printf 'nf_query_backup_age_seconds %d\n' "$backup_age"

backup_result="$(systemctl show --property=Result --value nf-query-backup.service 2>/dev/null || true)"
case "$backup_result" in
    success) backup_success=1 ;;
    '') backup_success=-1 ;;
    *) backup_success=0 ;;
esac
printf '# HELP nf_query_backup_last_run_success Whether the last backup unit run succeeded; -1 means unknown.\n'
printf '# TYPE nf_query_backup_last_run_success gauge\n'
printf 'nf_query_backup_last_run_success %d\n' "$backup_success"

printf '# HELP nf_query_filesystem_bytes Filesystem capacity for database and backup paths.\n'
printf '# TYPE nf_query_filesystem_bytes gauge\n'

filesystem_metrics() {
    local area="$1"
    local path="$2"
    local filesystem_size filesystem_available
    read -r filesystem_size filesystem_available < <(
        df --output=size,avail --block-size=1 "$path" | awk 'NR == 2 { print $1, $2 }'
    )
    printf 'nf_query_filesystem_bytes{area="%s",kind="size"} %s\n' "$area" "$filesystem_size"
    printf 'nf_query_filesystem_bytes{area="%s",kind="available"} %s\n' "$area" "$filesystem_available"
}

filesystem_metrics database "$DATA_DIR"
if [[ -d "$BACKUP_DIR" ]]; then
    filesystem_metrics backup "$BACKUP_DIR"
fi
