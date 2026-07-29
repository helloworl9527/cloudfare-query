#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
    echo "Usage: $0 BACKUP.sqlite" >&2
}

if [[ $# -ne 1 ]]; then
    usage
    exit 64
fi

backup_path="$(readlink -f -- "$1")"

for command_name in sha256sum sqlite3; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "restore_drill_error reason=missing_command command=$command_name" >&2
        exit 1
    fi
done

if [[ ! -r "$backup_path" ]]; then
    echo "restore_drill_error reason=input_unreadable" >&2
    exit 1
fi

umask 077
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/nf-query-restore-drill.XXXXXX")"
restored_db="$work_dir/bindings.db"

cleanup() {
    rm -rf -- "$work_dir"
}
trap cleanup EXIT INT TERM

checksum_path="$backup_path.sha256"
if [[ -f "$checksum_path" ]]; then
    expected_checksum="$(awk 'NR == 1 { print $1 }' "$checksum_path")"
    actual_checksum="$(sha256sum "$backup_path" | awk '{ print $1 }')"
    if [[ -z "$expected_checksum" || "$expected_checksum" != "$actual_checksum" ]]; then
        echo "restore_drill_error reason=checksum_mismatch" >&2
        exit 1
    fi
fi

install -m 0600 "$backup_path" "$restored_db"

integrity_result="$(sqlite3 -readonly -batch -noheader "$restored_db" 'PRAGMA integrity_check;')"
if [[ "$integrity_result" != "ok" ]]; then
    echo "restore_drill_error reason=integrity_check_failed" >&2
    exit 1
fi

bindings_table="$(sqlite3 -readonly -batch -noheader "$restored_db" \
    "SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name = 'bindings';")"
if [[ "$bindings_table" != "1" ]]; then
    echo "restore_drill_error reason=bindings_table_missing" >&2
    exit 1
fi

binding_count="$(sqlite3 -readonly -batch -noheader "$restored_db" 'SELECT count(*) FROM bindings;')"
migrations_table="$(sqlite3 -readonly -batch -noheader "$restored_db" \
    "SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name = 'schema_migrations';")"
if [[ "$migrations_table" != "1" ]]; then
    echo "restore_drill_error reason=schema_migrations_table_missing" >&2
    exit 1
fi
schema_version="$(sqlite3 -readonly -batch -noheader "$restored_db" \
    "SELECT coalesce(max(version), 0) FROM schema_migrations;")"
expected_schema_version="${EXPECTED_SCHEMA_VERSION:-1}"
if [[ ! "$schema_version" =~ ^[1-9][0-9]*$ || \
      ! "$expected_schema_version" =~ ^[1-9][0-9]*$ || \
      "$schema_version" != "$expected_schema_version" ]]; then
    echo "restore_drill_error reason=schema_version_mismatch actual=$schema_version expected=$expected_schema_version" >&2
    exit 1
fi
backup_bytes="$(stat -c %s "$backup_path")"

# Do not print binding values or leave the restored database behind.
echo "restore_drill_ok backup=$(basename "$backup_path") bytes=$backup_bytes bindings=$binding_count schema_version=$schema_version"
