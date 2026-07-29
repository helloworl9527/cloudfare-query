#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
    echo "Usage: $0 {address-jwt-key|mail-admin-password|admin-password-hash|mail-custom-password}" >&2
    echo "The credential value is read from standard input (or hidden input on a TTY)." >&2
}

if [[ ${EUID:-$(id -u)} -ne 0 || $# -ne 1 ]]; then
    usage
    exit 64
fi

credential_name="$1"
case "$credential_name" in
    address-jwt-key|mail-admin-password|admin-password-hash|mail-custom-password) ;;
    *)
        usage
        exit 64
        ;;
esac

if ! command -v systemd-creds >/dev/null 2>&1; then
    echo "systemd-creds is required" >&2
    exit 1
fi

if [[ -t 0 ]]; then
    IFS= read -r -s -p "Value for $credential_name: " credential_value
    echo >&2
else
    IFS= read -r credential_value || [[ -n "${credential_value:-}" ]]
fi

if [[ -z "${credential_value:-}" ]]; then
    echo "Refusing to install an empty credential" >&2
    exit 1
fi

credential_dir=/etc/nf-query/credentials
destination="$credential_dir/$credential_name.cred"
install -d -m 0700 -o root -g root "$credential_dir"
temporary="$(mktemp "$credential_dir/.$credential_name.XXXXXX")"

cleanup() {
    unset credential_value
    rm -f -- "$temporary"
}
trap cleanup EXIT INT TERM

printf '%s' "$credential_value" | \
    systemd-creds encrypt --name="$credential_name" - "$temporary"
chmod 0600 "$temporary"
chown root:root "$temporary"
mv -f -- "$temporary" "$destination"
unset credential_value
trap - EXIT

echo "Installed encrypted systemd credential: $destination"
