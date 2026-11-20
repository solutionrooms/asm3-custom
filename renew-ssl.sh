#!/bin/bash
set -euo pipefail

# SSL Certificate Renewal Script — safe to run from cron.
#
# certbot only renews when the cert is close to expiry, so running this daily is
# a no-op most days. nginx already serves /.well-known/acme-challenge/ from the
# shared certbot_www volume on port 80, so nothing needs recreating: certbot
# writes the challenge file, Let's Encrypt fetches it via the running nginx, and
# a graceful reload picks up the new cert.
#
# Uses `docker compose` (v2). v1 `docker-compose` is broken on do22
# (KeyError: 'ContainerConfig' on recreate).
#
# Usage: ./renew-ssl.sh            # renew if due
#        ./renew-ssl.sh --force    # renew now regardless of expiry

cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

RENEW_ARGS=()
if [ "${1:-}" = "--force" ]; then
    RENEW_ARGS+=(--force-renewal)
fi

log "Running certbot renew ${RENEW_ARGS[*]:-}"
if ! docker compose --profile ssl-management run --rm -T certbot renew --non-interactive "${RENEW_ARGS[@]}"; then
    log "ERROR: certbot renew failed"
    exit 1
fi

log "Reloading nginx"
docker compose exec -T nginx nginx -s reload

DOMAIN=$(grep "^NGINX_SERVER_NAME=" .env | cut -d= -f2)
# Check the cert nginx is actually serving (host openssl — the nginx image has no
# openssl CLI). Confirms the reload picked up the renewed cert, not just the file.
EXPIRY=$(echo | openssl s_client -connect 127.0.0.1:443 -servername "${DOMAIN}" 2>/dev/null \
    | openssl x509 -noout -enddate | cut -d= -f2)
if [ -z "${EXPIRY}" ]; then
    log "ERROR: could not read the cert nginx is serving on :443"
    exit 1
fi
log "OK — ${DOMAIN} serving cert valid until ${EXPIRY}"
