# SafePrint Docker Development Environment

This directory contains everything needed to run SafePrint in a complete, isolated Docker environment that fully replicates the production Ubuntu server.

## 🎯 Overview

This Docker setup provides:
- **Ubuntu 22.04** base image (matching production server OS)
- **MySQL 8.0** database server with full data import
- **Nginx** web server (same configuration as production)
- **Gunicorn** with gevent worker (same as production)
- **Python 3 virtual environment** with all dependencies
- **Cron jobs** for automated maintenance tasks
- **Printer polling daemon** for real-time printer monitoring
- **Same directory structure** as production (`/home/safeprint/dev/SafePrint`)

## 🚀 Quick Start (One-Click Setup)

### For the Developer Receiving This

1. **Clone the repository** (checkout the Admin Vendo Redesign branch):
   ```bash
   git clone git@github.com:vincentperezzz/SafePrint.git
   cd SafePrint
   git checkout Admin-Vendo-Redesign
   ```

2. **Run the setup script**:
   ```bash
   chmod +x docker/setup.sh
   ./docker/setup.sh
   ```

3. **Access the application**:
   - Web App: http://localhost
   - Django Admin: http://localhost/django-admin/

That's it! The entire environment is now running.

## 📁 Directory Structure

```
docker/
├── Dockerfile                 # Ubuntu-based image with all dependencies
├── docker-compose.yml         # Orchestration configuration
├── setup.sh                   # One-click setup script
├── export_database.sh         # Database export script (run on source server)
├── config/
│   ├── docker-entrypoint.sh   # Container initialization script
│   ├── nginx-docker.conf      # Nginx configuration
│   ├── gunicorn_docker.sh     # Gunicorn startup script
│   ├── supervisord.conf       # Service manager configuration
│   └── crontab                # Cron job definitions
└── data/
    ├── database_dump.sql      # Full database with data (generated)
    └── database_schema.sql    # Schema only (for reference)
```

## 🔧 Commands Reference

### Container Management
```bash
# Start the environment
docker compose -f docker/docker-compose.yml up -d

# Stop the environment
docker compose -f docker/docker-compose.yml down

# Restart
docker compose -f docker/docker-compose.yml restart

# View logs
docker logs -f safeprint-app

# Access container shell
docker exec -it safeprint-app bash

# Access Django shell
docker exec -it safeprint-app /home/safeprint/dev/SafePrint/venv/bin/python /home/safeprint/dev/SafePrint/manage.py shell
```

### Development Commands (Inside Container)
```bash
# Enter the container
docker exec -it safeprint-app bash

# Activate virtual environment
cd /home/safeprint/dev/SafePrint
source venv/bin/activate

# Run Django commands
python manage.py makemigrations
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser

# View service status
supervisorctl status

# Restart Gunicorn
supervisorctl restart gunicorn

# Restart Nginx
supervisorctl restart nginx
```

### Database Operations
```bash
# Access MySQL inside container
docker exec -it safeprint-app mysql -u SAFEPRINT_ADMIN -p'@MYSQL_datugavinoperez1' SAFEPRINT_DB

# Export database from container
docker exec safeprint-app mysqldump -u SAFEPRINT_ADMIN -p'@MYSQL_datugavinoperez1' SAFEPRINT_DB > backup.sql

# Import database to container
docker exec -i safeprint-app mysql -u SAFEPRINT_ADMIN -p'@MYSQL_datugavinoperez1' SAFEPRINT_DB < backup.sql
```

## 🔄 For the Source Server (Exporting Data)

Before the other developer can use this setup, you need to export the database:

1. **Run the export script**:
   ```bash
   cd /home/safeprint/dev/SafePrint
   chmod +x docker/export_database.sh
   ./docker/export_database.sh
   ```

2. **Commit and push**:
   ```bash
   git add docker/data/database_dump.sql
   git commit -m "Add database dump for docker setup"
   git push origin Vendo
   ```

3. **Create the new branch for the other developer**:
   ```bash
   git checkout -b Admin-Vendo-Redesign
   git push origin Admin-Vendo-Redesign
   ```

## 🌿 Branch Strategy

This Docker setup supports the following collaboration workflow:

```
main (stable)
 │
 ├── Vendo (your production branch)
 │    └── [Your development work]
 │
 └── Admin-Vendo-Redesign (other developer's branch)
      └── [Their development work - completely isolated]
```

Each developer works in their own branch with their own Docker environment. Later, branches can be merged for stable builds.

## 🔐 Environment Variables

The following environment variables are configured in the container:

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `DJANGO_SECRET_KEY` | `your-secret-key` | Django secret key |
| `DB_NAME` | `SAFEPRINT_DB` | MySQL database name |
| `DB_USER` | `SAFEPRINT_ADMIN` | MySQL user |
| `DB_PASSWORD` | `@MYSQL_datugavinoperez1` | MySQL password |
| `DB_HOST` | `localhost` | Database host (inside container) |
| `DB_PORT` | `3306` | Database port |
| `DEBUG` | `True` | Django debug mode |

## 📦 What's Included

### Services (Managed by Supervisor)
- **MySQL** - Database server
- **Nginx** - Web server / reverse proxy
- **Gunicorn** - Python WSGI server with gevent workers
- **Printer Polling Daemon** - Real-time printer status monitoring

### Cron Jobs
- `*/10 * * * *` - Delete empty upload folders
- `*/10 * * * *` - Delete stale documents
- `@hourly` - Printer polling daemon watchdog

### Volumes (Persistent Data)
- `safeprint_mysql_data` - MySQL database files
- `safeprint_media` - Uploaded files
- `safeprint_logs` - Application logs
- `safeprint_gunicorn_logs` - Gunicorn logs

## ⚠️ Troubleshooting

### Container won't start
```bash
# Check logs
docker logs safeprint-app

# Check if ports are in use
sudo lsof -i :80
sudo lsof -i :3306
```

### MySQL connection errors
```bash
# Check MySQL status inside container
docker exec -it safeprint-app mysqladmin ping -h localhost

# Check MySQL logs
docker exec -it safeprint-app tail -f /var/log/mysql/stderr.log
```

### Permission issues
```bash
# Fix permissions inside container
docker exec -it safeprint-app chown -R safeprint:www-data /home/safeprint/dev/SafePrint
```

### Reset everything
```bash
# Stop and remove container with volumes
docker compose -f docker/docker-compose.yml down -v

# Rebuild from scratch
docker compose -f docker/docker-compose.yml build --no-cache
docker compose -f docker/docker-compose.yml up -d
```

## 🖨️ Printer Integration Note

The printer polling feature uses SNMP to communicate with network printers. In the Docker environment:
- The container can communicate with printers on the same network
- Make sure the Docker network can reach your printer IPs
- For development without printers, the polling daemon will log errors but won't crash

## 📝 Development Workflow

1. **Make changes** to the code inside the container or mount your local code
2. **Restart Gunicorn** to apply Python changes:
   ```bash
   docker exec safeprint-app supervisorctl restart gunicorn
   ```
3. **Collect static files** after CSS/JS changes:
   ```bash
   docker exec -it safeprint-app /home/safeprint/dev/SafePrint/venv/bin/python /home/safeprint/dev/SafePrint/manage.py collectstatic --noinput
   ```
4. **Run migrations** after model changes:
   ```bash
   docker exec -it safeprint-app /home/safeprint/dev/SafePrint/venv/bin/python /home/safeprint/dev/SafePrint/manage.py migrate
   ```

---

This Docker environment provides a complete, isolated replica of the production server for safe development and testing.
