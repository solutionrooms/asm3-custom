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

# Function to check if certificates exist in volume
check_certificates() {
    docker run --rm -v "$(basename $(pwd))_certbot_certs:/certs" alpine \
        test -f "/certs/live/$DOMAIN/fullchain.pem" 2>/dev/null
}

# Check if certificates already exist
if check_certificates; then
    echo "✅ SSL certificates already exist for $DOMAIN"
    echo ""
    echo "To regenerate certificates, remove the certbot volumes:"
    echo "docker-compose down"
    echo "docker volume rm $(basename $(pwd))_certbot_certs $(basename $(pwd))_certbot_www"
    echo ""
    echo "🔄 Switching to SSL configuration and restarting services..."
    
    # Create SSL configuration
    sed "s/NGINX_SERVER_NAME_PLACEHOLDER/$DOMAIN/g" nginx-ssl.conf.template > nginx-processed.conf
    docker-compose down && docker-compose up -d
    
    echo "✅ Services restarted with SSL configuration"
    echo "🌐 Your site: https://$DOMAIN"
    exit 0
fi

echo "📦 Preparing for certificate generation..."

# Stop any existing containers to avoid conflicts
echo "🛑 Stopping existing containers..."
docker-compose down 2>/dev/null || true

echo "🌐 Creating temporary nginx configuration for ACME challenge..."
# Create temporary nginx config with domain substituted
sed "s/NGINX_SERVER_NAME_PLACEHOLDER/$DOMAIN/g" nginx-temp.conf.template > nginx-temp.conf

echo "🚀 Starting services with temporary configuration..."
# Use the pre-created docker-compose override file
docker-compose -f docker-compose.yml -f docker-compose.ssl-init.yml up -d

echo "⏳ Waiting for nginx to be ready..."
sleep 15

# Test that nginx is responding on port 80
if ! curl -f http://localhost:80/.well-known/acme-challenge/test >/dev/null 2>&1; then
    echo "⚠️  Warning: nginx not responding on port 80, but continuing..."
fi

echo "🎫 Generating SSL certificate for $DOMAIN..."
if docker-compose -f docker-compose.yml -f docker-compose.ssl-init.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --non-interactive \
    -d "$DOMAIN"; then
    
    echo "✅ SSL certificate generated successfully!"
    
    # Stop temporary setup
    echo "🔄 Stopping temporary configuration..."
    docker-compose -f docker-compose.yml -f docker-compose.ssl-init.yml down
    
    # Clean up temporary files
    rm -f nginx-temp.conf
    
    # Create SSL configuration from template
    echo "🔧 Creating SSL nginx configuration..."
    sed "s/NGINX_SERVER_NAME_PLACEHOLDER/$DOMAIN/g" nginx-ssl.conf.template > nginx-processed.conf
    
    # Start with SSL configuration
    echo "🚀 Starting with SSL configuration..."
    docker-compose up -d
    
    # Wait for services to be ready
    echo "⏳ Waiting for services to start..."
    sleep 10
    
    # Test SSL configuration
    if curl -k https://localhost >/dev/null 2>&1; then
        echo "✅ SSL configuration is working!"
    else
        echo "⚠️  SSL might need a moment to be ready"
    fi
    
    echo ""
    echo "🎉 SSL setup complete!"
    echo ""
    echo "Your site is now available at:"
    echo "🌐 https://$DOMAIN"
    echo ""
    echo "Certificate details:"
    echo "  - Valid for: $DOMAIN"
    echo "  - Expires: $(date -d '+90 days' +%Y-%m-%d)"
    echo "  - Auto-renewal: Configured"
    echo ""
    echo "Next steps:"
    echo "1. Visit https://$DOMAIN to test your site"
    echo "2. Set up auto-renewal: make ssl-auto-renew"
    echo "3. Test SSL configuration: https://www.ssllabs.com/ssltest/"
    
else
    echo "❌ Failed to generate SSL certificate!"
    echo ""
    echo "Please check:"
    echo "1. DNS: $DOMAIN points to this server's public IP"
    echo "2. Network: Port 80 is accessible from the internet"
    echo "3. Firewall: No blocking of HTTP traffic"
    echo "4. Domain: $DOMAIN is correctly configured"
    echo ""
    echo "Debug steps:"
    echo "1. Test DNS: dig $DOMAIN +short"
    echo "2. Test connectivity: curl -v http://$DOMAIN/.well-known/acme-challenge/test"
    echo "3. Check logs: docker-compose logs nginx"
    echo ""
    echo "🧹 Cleaning up temporary files..."
    docker-compose -f docker-compose.yml -f docker-compose.ssl-init.yml down 2>/dev/null || true
    rm -f nginx-temp.conf
    exit 1
fi