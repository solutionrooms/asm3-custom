# SSL Setup Guide for ASM3 Custom

## Quick Setup

1. **Configure domain in `.env`:**
   ```bash
   NGINX_SERVER_NAME=yourdomain.com
   ```

2. **Initialize SSL:**
   ```bash
   make init-ssl
   ```

3. **Verify:**
   - Visit https://yourdomain.com
   - Check SSL: https://www.ssllabs.com/ssltest/

## How It Works

### File Structure
```
nginx-ssl.conf.template      → SSL config template (with placeholders)
nginx-temp.conf.template     → Temporary config for certificate generation
docker-compose.ssl-init.yml  → Override that exposes port 80
init-ssl.sh                  → Orchestrates the entire process
nginx-processed.conf         → Final generated config (auto-created)
```

### Process Flow
1. **Template Processing**: `init-ssl.sh` reads domain from `.env`
2. **Temporary Setup**: Creates temp nginx config, exposes port 80
3. **Certificate Generation**: Let's Encrypt validates via port 80
4. **Configuration Switch**: Creates SSL config, restarts with HTTPS
5. **Cleanup**: Removes temporary files

## Troubleshooting

### "Connection refused" on port 443
**Root cause**: SSL certificates missing or nginx using wrong config

**Solution**: 
```bash
make init-ssl
```

### Let's Encrypt fails on ACME challenge
**Root cause**: Port 80 not accessible from internet

**Check**:
1. DNS points to correct IP: `dig yourdomain.com +short`
2. Port 80 reachable: `curl -v http://yourdomain.com/.well-known/acme-challenge/test`
3. No firewall blocking: `ufw status`

### Nginx won't start after SSL setup
**Root cause**: Invalid nginx configuration

**Debug**:
```bash
# Check nginx syntax
docker-compose exec nginx nginx -t

# Check logs
docker-compose logs nginx

# Manual config recovery
cp nginx-nossl.conf nginx-processed.conf
docker-compose restart nginx
```

### Port 80 vs 8095 Confusion
- **Port 80**: Required for Let's Encrypt ACME challenges (temporary)
- **Port 8095**: Alternative HTTP access (always available)
- **Port 443**: HTTPS access (after SSL setup)

## Manual Recovery

If `make init-ssl` fails completely:

```bash
# 1. Stop everything
docker-compose down

# 2. Generate certificates manually (expose port 80)
echo 'services:
  nginx:
    ports:
      - "80:80"
      - "8095:80" 
      - "443:443"' > temp-override.yml

docker-compose -f docker-compose.yml -f temp-override.yml up -d nginx
docker-compose run --rm certbot certonly --webroot --webroot-path=/var/www/certbot -d yourdomain.com

# 3. Create SSL config
sed "s/NGINX_SERVER_NAME_PLACEHOLDER/yourdomain.com/g" nginx-ssl.conf.template > nginx-processed.conf

# 4. Restart with SSL
docker-compose down
rm temp-override.yml
docker-compose up -d
```

## Security Notes

- Certificates auto-renew every 90 days
- HTTP automatically redirects to HTTPS
- Strong SSL ciphers and protocols configured
- Security headers included (HSTS, X-Frame-Options, etc.)

## Files Modified by SSL Setup

**Auto-generated** (will be overwritten):
- `nginx-processed.conf`
- `nginx-temp.conf` (temporary)

**Preserved**:
- `nginx-ssl.conf.template` (source template)
- `docker-compose.yml` (base configuration)
- SSL certificates (in Docker volumes)