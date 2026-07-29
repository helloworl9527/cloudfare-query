#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
    echo "Usage: sudo $0 [--source DIRECTORY] [--version VERSION] [--no-restart]" >&2
}

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
    echo "Run this script as root" >&2
    exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source_dir="$(cd -- "$SCRIPT_DIR/.." && pwd)"
version=""
restart_services=1

while [[ $# -gt 0 ]]; do
    case "$1" in
        --source)
            [[ $# -ge 2 ]] || { usage; exit 64; }
            source_dir="$(readlink -f -- "$2")"
            shift 2
            ;;
        --version)
            [[ $# -ge 2 ]] || { usage; exit 64; }
            version="$2"
            shift 2
            ;;
        --no-restart)
            restart_services=0
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            usage
            exit 64
            ;;
    esac
done

if [[ -z "$version" ]]; then
    version="$(date -u +%Y%m%dT%H%M%SZ)"
    if git_revision="$(git -C "$source_dir" rev-parse --short=12 HEAD 2>/dev/null)"; then
        version="$version-$git_revision"
    fi
fi

if [[ ! "$version" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$ ]]; then
    echo "Version may contain only letters, digits, dot, underscore and hyphen" >&2
    exit 64
fi

for command_name in curl flock rsync runuser systemctl; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: $command_name" >&2
        exit 1
    fi
done

if [[ ! -x /usr/bin/node || ! -x /usr/bin/npm ]]; then
    echo "System-wide Node.js and npm are required" >&2
    exit 1
fi
node_major="$(/usr/bin/node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" != "24" ]]; then
    echo "Node.js 24 LTS is required; found $(/usr/bin/node --version)" >&2
    exit 1
fi
if [[ ! -f "$source_dir/package.json" || ! -f "$source_dir/package-lock.json" ]]; then
    echo "Source must contain package.json and package-lock.json" >&2
    exit 1
fi

deploy_root=/opt/nf-query
releases_dir="$deploy_root/releases"
release_dir="$releases_dir/$version"
staging_dir="$releases_dir/.$version.staging.$$"
build_dir="$releases_dir/.$version.build.$$"

install -d -m 0755 -o root -g root "$releases_dir"
exec 9>"$deploy_root/.release.lock"
flock 9

old_target=""
old_real=""
if [[ -e "$deploy_root/current" && ! -L "$deploy_root/current" ]]; then
    echo "$deploy_root/current exists but is not a symbolic link" >&2
    exit 1
fi
if [[ -L "$deploy_root/current" ]]; then
    old_target="$(readlink "$deploy_root/current")"
    old_real="$(readlink -f "$deploy_root/current" 2>/dev/null || true)"
fi

if [[ -e "$release_dir" ]]; then
    echo "Release already exists: $release_dir" >&2
    exit 1
fi

cleanup() {
    if [[ -n "${staging_dir:-}" && -d "$staging_dir" ]]; then
        rm -rf -- "$staging_dir"
    fi
    if [[ -n "${build_dir:-}" && -d "$build_dir" ]]; then
        rm -rf -- "$build_dir"
    fi
}
trap cleanup EXIT INT TERM

mkdir -m 0755 "$staging_dir"
rsync -a --delete \
    --exclude '/.git/' \
    --exclude '/.env' \
    --exclude '/.env.*' \
    --exclude '/.npmrc' \
    --exclude '/node_modules/' \
    --exclude '*.db' \
    --exclude '*.db-shm' \
    --exclude '*.db-wal' \
    "$source_dir/" "$staging_dir/"

chown -hR root:root "$staging_dir"
chmod -R u=rwX,go=rX "$staging_dir"
install -d -m 0750 -o nf-query-build -g nf-query-build "$build_dir"
install -d -m 0700 -o nf-query-build -g nf-query-build \
    "$build_dir/home" "$build_dir/cache"
install -m 0644 -o nf-query-build -g nf-query-build \
    "$staging_dir/package.json" "$staging_dir/package-lock.json" "$build_dir/"

(
    cd "$build_dir"
    runuser --user nf-query-build -- env \
        HOME="$build_dir/home" npm_config_cache="$build_dir/cache" \
        /usr/bin/npm ci --omit=dev --no-audit --no-fund
)
mv -- "$build_dir/node_modules" "$staging_dir/node_modules"

(
    cd "$staging_dir"
    runuser --user nf-query-build -- /usr/bin/node --input-type=commonjs -e \
        "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.prepare('select 1').get(); db.close();"
    runuser --user nf-query-build -- env \
        HOME="$build_dir/home" npm_config_cache="$build_dir/cache" \
        /usr/bin/npm test
)
rm -rf -- "$build_dir"
build_dir=""

chown -hR root:root "$staging_dir"
chmod -R u=rwX,go=rX "$staging_dir"
mv -- "$staging_dir" "$release_dir"
staging_dir=""

activate_link() {
    local target="$1"
    local temporary_link="$deploy_root/.current.$$.tmp"
    rm -f -- "$temporary_link"
    ln -s "$target" "$temporary_link"
    mv -Tf -- "$temporary_link" "$deploy_root/current"
}

wait_for_health() {
    local port="$1"
    local source_address="${2:-}"
    local attempt
    local -a interface_args=()
    if [[ -n "$source_address" ]]; then interface_args=(--interface "$source_address"); fi
    for ((attempt = 0; attempt < 25; attempt++)); do
        if curl --fail --silent --show-error --max-time 1 \
            "${interface_args[@]}" \
            "http://127.0.0.1:$port/internal/health" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

restart_and_check() {
    # Admin starts first so migrations complete before the read-only process
    # opens the bindings database.
    systemctl restart nf-query-admin.service || return 1
    wait_for_health 3790 || return 1
    systemctl restart nf-query-public.service || return 1
    wait_for_health 3789 127.0.0.2 || return 1
}

activate_link "releases/$version"

if [[ "$restart_services" == 1 ]]; then
    if ! restart_and_check; then
        echo "Release $version failed its service health check" >&2
        if [[ -n "$old_target" && -n "$old_real" && -d "$old_real" && "$old_real" == "$releases_dir/"* ]]; then
            echo "Restoring previous current target: $old_target" >&2
            activate_link "$old_target"
            if ! restart_and_check; then
                echo "Automatic application rollback also failed; services require manual recovery" >&2
                systemctl stop nf-query-public.service nf-query-admin.service || true
            fi
        else
            echo "No valid previous release is available; stopping both services and removing the failed first-release link" >&2
            systemctl stop nf-query-public.service nf-query-admin.service || true
            if [[ -L "$deploy_root/current" && "$(readlink "$deploy_root/current")" == "releases/$version" ]]; then
                rm -f -- "$deploy_root/current"
            fi
        fi
        exit 1
    fi
    if ! "$deploy_root/current/scripts/verify-loopback-isolation.sh"; then
        echo "Loopback isolation is ineffective; stopping application services" >&2
        systemctl stop nf-query-public.service nf-query-admin.service
        exit 1
    fi
fi

echo "release_activated version=$version node=$(/usr/bin/node --version) path=$release_dir"
