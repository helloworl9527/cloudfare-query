#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
    echo "Run this script as root" >&2
    exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

for command_name in curl nginx openssl rsync sqlite3 systemctl systemd-analyze systemd-creds systemd-tmpfiles; do
    require_command "$command_name"
done

if [[ ! -x /usr/bin/node || ! -x /usr/bin/npm ]]; then
    echo "Node.js and npm must be installed system-wide under /usr/bin" >&2
    exit 1
fi

node_major="$(/usr/bin/node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" != "24" ]]; then
    echo "Node.js 24 LTS is required; found $(/usr/bin/node --version)" >&2
    exit 1
fi

if awk '$1 == "nameserver" && ($2 == "127.0.0.1" || $2 == "::1") { found = 1 } END { exit !found }' /etc/resolv.conf; then
    echo "The public service denies 127.0.0.1/::1; configure DNS on 127.0.0.53 or a non-loopback resolver" >&2
    exit 1
fi

uid_min="$(awk '$1 == "UID_MIN" { value = $2 } END { print value }' /etc/login.defs)"
if [[ ! "$uid_min" =~ ^[1-9][0-9]*$ ]]; then uid_min=1000; fi

validate_group() {
    local name="$1"
    local allowed_member="${2:-}"
    local entry group_name password gid members member
    local -a member_list=()
    entry="$(getent group "$name")" || return 1
    IFS=: read -r group_name password gid members <<< "$entry"
    if [[ "$group_name" != "$name" || ! "$gid" =~ ^[0-9]+$ || "$gid" -eq 0 || "$gid" -ge "$uid_min" ]]; then
        echo "Refusing unsafe pre-existing group: $name" >&2
        exit 1
    fi
    if [[ "$(getent group | awk -F: -v wanted="$gid" '$3 == wanted { count += 1 } END { print count + 0 }')" != 1 ]]; then
        echo "Numeric GID $gid for $name is aliased by another group" >&2
        exit 1
    fi
    IFS=, read -r -a member_list <<< "$members"
    for member in "${member_list[@]}"; do
        if [[ -n "$member" && "$member" != "$allowed_member" ]]; then
            echo "Unexpected member '$member' in security group $name" >&2
            exit 1
        fi
    done
}

validate_user() {
    local name="$1"
    local primary_group="$2"
    shift 2
    local -a allowed_groups=("$@")
    local entry user_name password uid gid gecos home shell expected_gid group allowed found
    entry="$(getent passwd "$name")" || {
        echo "Missing expected service user: $name" >&2
        exit 1
    }
    IFS=: read -r user_name password uid gid gecos home shell <<< "$entry"
    expected_gid="$(getent group "$primary_group" | cut -d: -f3)"
    if [[ "$user_name" != "$name" || ! "$uid" =~ ^[0-9]+$ || "$uid" -eq 0 || "$uid" -ge "$uid_min" || \
          "$gid" != "$expected_gid" || "$home" != /nonexistent || \
          ( "$shell" != /usr/sbin/nologin && "$shell" != /bin/false ) ]]; then
        echo "Refusing unsafe pre-existing service user: $name" >&2
        exit 1
    fi
    if [[ "$(getent passwd | awk -F: -v wanted="$uid" '$3 == wanted { count += 1 } END { print count + 0 }')" != 1 ]]; then
        echo "Numeric UID $uid for $name is aliased by another user" >&2
        exit 1
    fi
    for group in $(id -nG "$name"); do
        found=0
        for allowed in "${allowed_groups[@]}"; do
            if [[ "$group" == "$allowed" ]]; then found=1; break; fi
        done
        if [[ "$found" != 1 ]]; then
            echo "Unexpected supplementary group '$group' for service user $name" >&2
            exit 1
        fi
    done
    for allowed in "${allowed_groups[@]}"; do
        if ! id -nG "$name" | tr ' ' '\n' | grep -Fxq "$allowed"; then
            echo "Service user $name is missing required group $allowed" >&2
            exit 1
        fi
    done
}

if ! getent group nf-query-public >/dev/null; then groupadd --system nf-query-public; fi
if ! getent group nf-query-admin >/dev/null; then groupadd --system nf-query-admin; fi
if ! getent group nf-query-build >/dev/null; then groupadd --system nf-query-build; fi
validate_group nf-query-public nf-query-admin
validate_group nf-query-admin
validate_group nf-query-build

if ! id nf-query-public >/dev/null 2>&1; then
    useradd --system --gid nf-query-public --home-dir /nonexistent \
        --shell /usr/sbin/nologin nf-query-public
fi
if ! id nf-query-admin >/dev/null 2>&1; then
    useradd --system --gid nf-query-admin --groups nf-query-public \
        --home-dir /nonexistent --shell /usr/sbin/nologin nf-query-admin
fi
if ! id nf-query-build >/dev/null 2>&1; then
    useradd --system --gid nf-query-build --home-dir /nonexistent \
        --shell /usr/sbin/nologin nf-query-build
fi

validate_group nf-query-public nf-query-admin
validate_group nf-query-admin
validate_group nf-query-build
validate_user nf-query-public nf-query-public nf-query-public
validate_user nf-query-admin nf-query-admin nf-query-admin nf-query-public
validate_user nf-query-build nf-query-build nf-query-build
if [[ "$(id -u nf-query-public)" == "$(id -u nf-query-admin)" || \
      "$(id -u nf-query-public)" == "$(id -u nf-query-build)" || \
      "$(id -u nf-query-admin)" == "$(id -u nf-query-build)" || \
      "$(getent group nf-query-public | cut -d: -f3)" == "$(getent group nf-query-admin | cut -d: -f3)" || \
      "$(getent group nf-query-public | cut -d: -f3)" == "$(getent group nf-query-build | cut -d: -f3)" || \
      "$(getent group nf-query-admin | cut -d: -f3)" == "$(getent group nf-query-build | cut -d: -f3)" ]]; then
    echo "Public, admin and build identities must use distinct numeric UID/GID values" >&2
    exit 1
fi

install -d -m 0755 -o root -g root /opt/nf-query /opt/nf-query/releases
install -d -m 0755 -o root -g root /usr/local/libexec/nf-query
install -d -m 0700 -o root -g root /etc/nf-query/credentials

install -m 0755 "$REPO_ROOT/scripts/backup-bindings.sh" \
    /usr/local/libexec/nf-query/backup-bindings.sh
install -m 0755 "$REPO_ROOT/scripts/restore-drill.sh" \
    /usr/local/libexec/nf-query/restore-drill.sh
install -m 0755 "$REPO_ROOT/scripts/metrics-snapshot.sh" \
    /usr/local/libexec/nf-query/metrics-snapshot.sh
install -m 0755 "$REPO_ROOT/scripts/install-systemd-credential.sh" \
    /usr/local/libexec/nf-query/install-systemd-credential.sh
install -m 0755 "$REPO_ROOT/scripts/verify-loopback-isolation.sh" \
    /usr/local/libexec/nf-query/verify-loopback-isolation.sh

for unit in nf-query-public.service nf-query-admin.service \
    nf-query-backup.service nf-query-backup.timer; do
    install -m 0644 "$REPO_ROOT/deploy/systemd/$unit" "/etc/systemd/system/$unit"
done
install -m 0644 "$REPO_ROOT/deploy/tmpfiles.d/nf-query.conf" \
    /etc/tmpfiles.d/nf-query.conf

install -d -m 0755 /etc/nginx/snippets /etc/nginx/sites-available /etc/nginx/sites-enabled
install -m 0644 "$REPO_ROOT/deploy/nginx/nf-query-log-format.conf" \
    /etc/nginx/conf.d/nf-query-log-format.conf
install -m 0644 "$REPO_ROOT/deploy/nginx/nf-query-cloudflare-ips.conf" \
    /etc/nginx/conf.d/nf-query-cloudflare-ips.conf
install -m 0644 "$REPO_ROOT/deploy/nginx/nf-query-proxy.conf" \
    /etc/nginx/snippets/nf-query-proxy.conf

proxy_secret_path=/etc/nf-query/proxy-auth-secret
if [[ -e "$proxy_secret_path" && ( ! -f "$proxy_secret_path" || -L "$proxy_secret_path" ) ]]; then
    echo "Refusing non-regular proxy secret path: $proxy_secret_path" >&2
    exit 1
fi
if [[ ! -e "$proxy_secret_path" ]]; then
    proxy_secret_tmp="$(mktemp /etc/nf-query/.proxy-auth-secret.XXXXXX)"
    openssl rand -hex 32 > "$proxy_secret_tmp"
    chown root:root "$proxy_secret_tmp"
    chmod 0600 "$proxy_secret_tmp"
    mv -- "$proxy_secret_tmp" "$proxy_secret_path"
fi
chown root:root "$proxy_secret_path"
chmod 0600 "$proxy_secret_path"
proxy_secret="$(<"$proxy_secret_path")"
if [[ ! "$proxy_secret" =~ ^[0-9a-f]{64}$ ]]; then
    echo "Proxy secret must contain exactly 64 lowercase hex characters" >&2
    exit 1
fi
proxy_snippet_tmp="$(mktemp /etc/nginx/snippets/.nf-query-proxy-secret.XXXXXX)"
printf 'proxy_set_header X-NFQ-Proxy-Auth "%s";\n' "$proxy_secret" > "$proxy_snippet_tmp"
unset proxy_secret
chown root:root "$proxy_snippet_tmp"
chmod 0600 "$proxy_snippet_tmp"
mv -- "$proxy_snippet_tmp" /etc/nginx/snippets/nf-query-proxy-secret.conf

install -m 0644 "$REPO_ROOT/deploy/nginx/nf-query.conf" \
    /etc/nginx/sites-available/nf-query.conf
ln -sfn /etc/nginx/sites-available/nf-query.conf /etc/nginx/sites-enabled/nf-query.conf

systemd-tmpfiles --create /etc/tmpfiles.d/nf-query.conf
systemctl daemon-reload
systemd-analyze verify \
    /etc/systemd/system/nf-query-public.service \
    /etc/systemd/system/nf-query-admin.service \
    /etc/systemd/system/nf-query-backup.service \
    /etc/systemd/system/nf-query-backup.timer
nginx -t

if systemctl is-active --quiet nginx.service; then
    systemctl reload nginx.service
fi

systemctl enable nf-query-public.service nf-query-admin.service nf-query-backup.timer

echo "Host integration installed with $(/usr/bin/node --version)."
echo "Next: install credentials, run certbot for the public hostname, then run scripts/release.sh."
