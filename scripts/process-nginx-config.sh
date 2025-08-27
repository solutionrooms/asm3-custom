#!/bin/bash
# Process nginx configuration with environment variables
# Choose SSL or no-SSL config based on certificate availability

# Check if SSL certificates exist
if docker run --rm -v "asm3-custom_certbot_certs:/certs" alpine test -f /certs/live/$(grep NGINX_SERVER_NAME .env | cut -d= -f2)/fullchain.pem 2>/dev/null; then
    echo "SSL certificates found - using SSL configuration"
    
    # Get domain from .env file
    DOMAIN=$(grep NGINX_SERVER_NAME .env | cut -d= -f2)
    
    # Generate SSL config with domain substitution
    sed "s/NGINX_SERVER_NAME_PLACEHOLDER/$DOMAIN/g" nginx-ssl.conf.template > nginx-processed.conf
    
    echo "Using SSL configuration for domain: $DOMAIN"
else
    echo "No SSL certificates found - using non-SSL configuration for local development"
    cp nginx-nossl.conf nginx-processed.conf
fi