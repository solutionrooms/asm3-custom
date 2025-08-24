#!/bin/bash

# SSL Certificate Renewal Script
# Run this manually to force certificate renewal

echo "🔄 Forcing SSL certificate renewal..."

docker-compose --profile ssl-management run --rm certbot renew --force-renewal

if [ $? -eq 0 ]; then
    echo "✅ Certificate renewed successfully!"
    echo "🔄 Reloading nginx..."
    docker-compose exec nginx nginx -s reload
    echo "🎉 SSL renewal complete!"
else
    echo "❌ Certificate renewal failed!"
    exit 1
fi