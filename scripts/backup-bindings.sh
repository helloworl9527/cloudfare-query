#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

DB_PATH="${BINDINGS_DB_PATH:-/var/lib/nf-query/shared/bindings.db}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/nf-query}"
WORK_DIR="${BACKUP_WORK_DIR:-${RUNTIME_DIRECTORY:-/tmp}}"
WEEKLY_KEEP="${WEEKLY_KEEP:-8}"

for command_name in flock sha256sum sqlite3; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "backup_error reason=missing_command command=$command_name" >&2
        exit 1
    fi
done

if [[ ! -r "$DB_PATH" ]]; then
    echo "backup_error reason=database_unreadable path=$DB_PATH" >&2
    exit 1
fi

if [[ ! "$WEEKLY_KEEP" =~ ^[1-9][0-9]*$ ]]; then
    echo "backup_error reason=invalid_retention" >&2
    exit 1
fi

mkdir -p "$BACKUP_ROOT/weekly"
if [[ ! -d "$WORK_DIR" || ! -w "$WORK_DIR" ]]; then
    echo "backup_error reason=work_directory_unwritable" >&2
    exit 1
fi
exec 9>"$BACKUP_ROOT/.backup.lock"
if ! flock -n 9; then
    echo "backup_skipped reason=already_running"
    exit 0
fi

started_epoch="$(date +%s)"
timestamp="$(date -u +%Y%m%dT%H%M%S%NZ)"
snapshot_tmp="$WORK_DIR/.bindings-$timestamp.$$.sqlite"
weekly_name="bindings-$timestamp.sqlite"
weekly_path="$BACKUP_ROOT/weekly/$weekly_name"
weekly_checksum_tmp="$BACKUP_ROOT/weekly/.$weekly_name.sha256.$$"

cleanup() {
    rm -f -- "$snapshot_tmp"
    rm -f -- "$weekly_checksum_tmp"
}
trap cleanup EXIT INT TERM

source_check="$(sqlite3 -readonly -batch -noheader -cmd '.timeout 15000' "$DB_PATH" 'PRAGMA quick_check;')"
if [[ "$source_check" != "ok" ]]; then
    echo "backup_error reason=source_quick_check_failed" >&2
    exit 1
fi

# sqlite3's online backup API produces a transactionally consistent snapshot
# even while the admin service is running.
sqlite3 -readonly -batch -cmd '.timeout 15000' "$DB_PATH" ".backup '$snapshot_tmp'"

snapshot_check="$(sqlite3 -readonly -batch -noheader "$snapshot_tmp" 'PRAGMA quick_check;')"
if [[ "$snapshot_check" != "ok" ]]; then
    echo "backup_error reason=snapshot_quick_check_failed" >&2
    exit 1
fi

if [[ -e "$weekly_path" || -e "$weekly_path.sha256" ]]; then
    echo "backup_error reason=timestamp_collision" >&2
    exit 1
fi
chmod 0600 "$snapshot_tmp"
weekly_checksum="$(sha256sum "$snapshot_tmp")"
printf '%s  %s\n' "${weekly_checksum%% *}" "$weekly_name" > "$weekly_checksum_tmp"
chmod 0600 "$weekly_checksum_tmp"
# The checksum is visible first and the snapshot is the commit marker. A
# reader that enumerates *.sqlite can therefore never observe a missing checksum.
mv -- "$weekly_checksum_tmp" "$weekly_path.sha256"
mv -- "$snapshot_tmp" "$weekly_path"

prune_by_count() {
    local directory="$1"
    local keep="$2"
    local -a files=()
    local index

    mapfile -t files < <(
        find "$directory" -maxdepth 1 -type f -name 'bindings-*.sqlite' \
            -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-
    )
    for ((index = keep; index < ${#files[@]}; index++)); do
        rm -f -- "${files[$index]}" "${files[$index]}.sha256"
    done
}

prune_orphan_checksums() {
    local directory="$1"
    local checksum data_file
    while IFS= read -r -d '' checksum; do
        data_file="${checksum%.sha256}"
        if [[ ! -e "$data_file" ]]; then rm -f -- "$checksum"; fi
    done < <(find "$directory" -maxdepth 1 -type f -name 'bindings-*.sqlite.sha256' -print0)
}

prune_by_count "$BACKUP_ROOT/weekly" "$WEEKLY_KEEP"
prune_orphan_checksums "$BACKUP_ROOT/weekly"
find "$BACKUP_ROOT" -maxdepth 1 -type f -name '.bindings-*.sqlite*' -mmin +120 -delete

finished_epoch="$(date +%s)"
backup_bytes="$(stat -c %s "$weekly_path")"
echo "backup_created file=$weekly_name bytes=$backup_bytes duration_seconds=$((finished_epoch - started_epoch)) weekly_keep=$WEEKLY_KEEP"
