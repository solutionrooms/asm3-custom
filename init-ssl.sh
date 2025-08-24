#!/bin/bash

# SSL Certificate Initialization Script for ASM3
# This script sets up Let's Encrypt SSL certificates using domain from .env file

set -e

# Read domain from .env file
DOMAIN=$(grep "^NGINX_SERVER_NAME=" .env | cut -d= -f2)
if [ -z "$DOMAIN" ]; then
    echo "❌ ERROR: NGINX_SERVER_NAME not found in .env file"
    exit 1
fi

EMAIL="jon.scott@fridaydigital.co.uk"  # Change this to your email

echo "🔐 Initializing SSL certificates for $DOMAIN"

# Check if certificates already exist
if [ -d "./certbot_certs/live/$DOMAIN" ]; then
    echo "✅ SSL certificates already exist for $DOMAIN"
    echo "To regenerate certificates, remove the certbot_certs volume and run this script again:"
    echo "docker-compose down && docker volume rm asm3-bghr_certbot_certs && docker volume rm asm3-bghr_certbot_www"
    exit 0
fi

echo "📦 Preparing for certificate generation..."

# Stop any existing containers to avoid conflicts
echo "🛑 Stopping existing containers..."
docker-compose down 2>/dev/null || true

# Start nginx with temporary SSL configuration for initial certificate generation
echo "🌐 Creating temporary nginx configuration..."
cat > nginx-temp.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 80;
        server_name $DOMAIN;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 'SSL Certificate Generation in Progress';
            add_header Content-Type text/plain;
        }
    }
}
EOF

# Create temporary docker-compose override for direct config mounting
echo "🔧 Creating temporary docker-compose override..."
cat > docker-compose.ssl-init.yml << EOF
services:
  nginx:
    volumes:
      - ./nginx-temp.conf:/etc/nginx/nginx.conf:ro
      - certbot_certs:/etc/letsencrypt
      - certbot_www:/var/www/certbot
    environment: []
EOF

echo "🚀 Starting nginx with temporary configuration..."
docker-compose -f docker-compose.yml -f docker-compose.ssl-init.yml up -d nginx

echo "⏳ Waiting for nginx to be ready..."
sleep 10

echo "🎫 Generating SSL certificate for $DOMAIN..."
docker-compose -f docker-compose.yml -f docker-compose.ssl-init.yml --profile ssl-management run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

# Check if certificate was generated successfully
if docker-compose -f docker-compose.yml -f docker-compose.ssl-init.yml exec nginx test -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem; then
    echo "✅ SSL certificate generated successfully!"
    
    # Stop temporary setup and clean up
    echo "🔄 Switching to full SSL configuration..."
    docker-compose -f docker-compose.yml -f docker-compose.ssl-init.yml down
    rm nginx-temp.conf docker-compose.ssl-init.yml
    
    # Start with full SSL configuration
    echo "🔄 Starting with SSL configuration..."
    docker-compose up -d
    
    echo "🎉 SSL setup complete!"
    echo ""
    echo "Your site is now available at:"
    echo "🌐 https://$DOMAIN"
    echo ""
    echo "Certificate will auto-renew every 12 hours via the certbot container."
    echo ""
    echo "Next steps:"
    echo "1. Update your .env file with the correct domain URLs"
    echo "2. Test your SSL configuration at: https://www.ssllabs.com/ssltest/"
    
else
    echo "❌ Failed to generate SSL certificate!"
    echo "Please check:"
    echo "1. Your domain DNS A record points to this server's public IP"
    echo "2. Port 80 is accessible from the internet"
    echo "3. No firewall is blocking the connection"
    echo ""
    echo "Cleaning up temporary files..."
    docker-compose -f docker-compose.yml -f docker-compose.ssl-init.yml down
    rm nginx-temp.conf docker-compose.ssl-init.yml 2>/dev/null || true
    exit 1
fi