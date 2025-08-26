#!/bin/bash

# Script to process nginx configuration template with environment variables
# This ensures the nginx config is properly substituted before container startup

set -e

echo "🔧 Processing nginx configuration template..."

# Read domain from .env file
DOMAIN=$(grep "^NGINX_SERVER_NAME=" .env | cut -d= -f2)
if [ -z "$DOMAIN" ]; then
    echo "❌ ERROR: NGINX_SERVER_NAME not found in .env file"
    exit 1
fi

echo "📝 Using domain: $DOMAIN"

# Check if SSL certificates exist (for production) or if we're in local development
if [ -d "/etc/letsencrypt/live/$DOMAIN" ] || docker volume ls | grep -q certbot_certs; then
    # Check if certificates actually exist in the volume
    if docker-compose run --rm --entrypoint="" nginx test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null; then
        echo "🔒 SSL certificates found - using SSL configuration"
        sed "s/\${NGINX_SERVER_NAME}/$DOMAIN/g" nginx-ssl.conf > nginx-processed.conf
    else
        echo "🌐 No SSL certificates found - using no-SSL configuration for local development"
        cp nginx-nossl.conf nginx-processed.conf
    fi
else
    echo "🌐 Local development detected - using no-SSL configuration"
    cp nginx-nossl.conf nginx-processed.conf
fi

echo "✅ Nginx configuration processed successfully"
echo "📄 Output: nginx-processed.conf"