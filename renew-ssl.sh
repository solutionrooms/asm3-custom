#!/bin/bash
set -euo pipefail

# SSL Certificate Renewal Script
# Ensures nginx is listening on port 80 so Let's Encrypt can fetch the HTTP-01 challenge.

echo "🔄 Forcing SSL certificate renewal..."

RENEW_OVERRIDE="docker-compose.ssl-renew.yml"
if [ ! -f "$RENEW_OVERRIDE" ]; then
    echo "❌ Missing $RENEW_OVERRIDE (ensure you pulled the latest repo files)."
    exit 1
fi

echo "🔓 Ensuring port 80 is exposed for the ACME challenge..."
# Remove any stale nginx container metadata to avoid recreate errors on some docker-compose versions
docker-compose -f docker-compose.yml -f "$RENEW_OVERRIDE" rm -f -s nginx >/dev/null 2>&1 || true
docker-compose -f docker-compose.yml -f "$RENEW_OVERRIDE" up -d --no-deps nginx

if docker-compose --profile ssl-management run --rm certbot renew --force-renewal; then
    echo "✅ Certificate renewed successfully!"
    echo "🔄 Reloading nginx..."
    docker-compose exec nginx nginx -s reload
    echo "🎉 SSL renewal complete!"
else
    echo "❌ Certificate renewal failed!"
    exit 1
fi
