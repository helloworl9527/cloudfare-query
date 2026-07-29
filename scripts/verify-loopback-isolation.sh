#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
    echo "Run this verification as root" >&2
    exit 1
fi

for command_name in curl systemctl systemd-run; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "loopback_isolation_error reason=missing_command command=$command_name" >&2
        exit 1
    fi
done

if ! systemctl is-active --quiet nf-query-admin.service; then
    echo "loopback_isolation_error reason=admin_not_running" >&2
    exit 1
fi

configured_deny="$(systemctl show --property=IPAddressDeny --value nf-query-public.service 2>/dev/null || true)"
has_ipv4_deny=0
has_ipv6_deny=0
for deny_token in $configured_deny; do
    case "$deny_token" in
        127.0.0.1|127.0.0.1/32) has_ipv4_deny=1 ;;
        ::1|::1/128) has_ipv6_deny=1 ;;
    esac
done
if [[ "$has_ipv4_deny" != 1 || "$has_ipv6_deny" != 1 ]]; then
    echo "loopback_isolation_error reason=public_unit_filter_missing" >&2
    exit 1
fi

direct_admin_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 3 http://127.0.0.1:3790/admin/api/session || true)"
if [[ "$direct_admin_status" != 403 ]]; then
    echo "loopback_isolation_error reason=direct_admin_proxy_auth_not_rejected status=$direct_admin_status" >&2
    exit 1
fi

# Nginx is directly public (no loopback Tunnel listener): the vhost also
# rejects any TCP peer outside Cloudflare's published ranges, so this check
# must go out through the real hostname rather than hit loopback with a
# forged Host header, or the Cloudflare-IP geo filter would reject it before
# it ever reached the admin proxy logic.
proxied_admin_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 5 https://nf.mystool.me/admin/api/session || true)"
if [[ "$proxied_admin_status" != 401 ]]; then
    echo "loopback_isolation_error reason=nginx_proxy_auth_not_accepted status=$proxied_admin_status" >&2
    exit 1
fi

test_id="$(date +%s%N)-$$-$RANDOM"
control_unit="nf-query-loopback-control-$test_id"
deny_unit="nf-query-loopback-deny-$test_id"
health_url=http://127.0.0.1:3790/internal/health

# First prove that a transient process under the public UID can reach the
# health endpoint when no cgroup filter is attached. This prevents an unrelated
# systemd-run or connectivity failure from being mistaken for a successful
# firewall test.
if ! systemd-run --quiet --wait --collect --unit="$control_unit" \
    --property=User=nf-query-public \
    /usr/bin/curl --fail --silent --show-error --max-time 3 "$health_url" \
    >/dev/null 2>&1; then
    echo "loopback_isolation_error reason=control_connection_failed" >&2
    exit 1
fi

# The same request must fail when equivalent IPAddressDeny rules are attached
# to a transient unit. On kernels/container managers without cgroup BPF these
# properties silently have no effect, so a successful curl is a hard failure.
if systemd-run --quiet --wait --collect --unit="$deny_unit" \
    --property=User=nf-query-public \
    --property='IPAddressDeny=127.0.0.1 ::1' \
    /usr/bin/curl --fail --silent --show-error --max-time 3 "$health_url" \
    >/dev/null 2>&1; then
    echo "loopback_isolation_error reason=cgroup_bpf_filter_ineffective" >&2
    exit 1
fi

# Ingress from Nginx's dedicated 127.0.0.2 source remains reachable.
if ! curl --fail --silent --show-error --max-time 3 --interface 127.0.0.2 \
    http://127.0.0.1:3789/internal/health >/dev/null; then
    echo "loopback_isolation_error reason=public_allowed_source_failed" >&2
    exit 1
fi

if ! curl --fail --silent --show-error --max-time 5 https://nf.mystool.me/ >/dev/null; then
    echo "loopback_isolation_error reason=nginx_public_proxy_bind_failed" >&2
    exit 1
fi

echo "loopback_isolation_ok denied=127.0.0.1,::1 allowed_source=127.0.0.2"
