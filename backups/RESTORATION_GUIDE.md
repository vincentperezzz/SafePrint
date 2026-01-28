# SafePrint Restoration Guide
**Backup Date:** January 28, 2026
**Branch:** main

## Quick Restore Steps

### 1. Restore Database
```bash
mysql -u SAFEPRINT_ADMIN -p SAFEPRINT_DB < safeprint_backup_20260128_131109.sql
```

### 2. Restore Environment Configuration
```bash
cp .env_backup_20260128_131151 ../venv/.env
chmod 600 ../venv/.env
```

### 3. Restore Media Files
```bash
cp -r profile_images_backup_20260128/* ../media/profile_images/
```

### 4. SSL Certificates Location
**Path:** `/etc/letsencrypt/live/nanoprint.duckdns.org/`
- fullchain.pem
- privkey.pem

To backup SSL certificates (run as root):
```bash
sudo tar -czf ssl_certs_backup.tar.gz /etc/letsencrypt/
```

### 5. System Services
Ensure these services are configured:
- `safeprint.service` (Gunicorn)
- Nginx with SSL configuration
- DuckDNS DNS updates
- SNMP printer polling cron job

### 6. Python Environment
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 7. Database Credentials (from .env)
- **DB_NAME:** SAFEPRINT_DB
- **DB_USER:** SAFEPRINT_ADMIN
- **DB_HOST:** localhost
- **DB_PORT:** 3306

## Files Backed Up
- ✅ MySQL database dump (46KB)
- ✅ .env configuration file
- ✅ Profile images (default-avatar.png, ico_1.png)
- ⚠️ SSL certificates (documented, requires sudo to backup)
- ✅ Full git repository on GitHub (origin/main)

## Notes
- The database export shows a minor PROCESS privilege warning but data was successfully exported
- DEBUG is currently set to True in settings.py (disable for production)
- Allowed hosts include: localhost, 127.0.0.1, 192.168.0.100, nanoprint.com, nanoprint.duckdns.org, safeprint
