#!/bin/bash
set -e

echo "========================================"
echo "SafePrint Docker Environment Startup"
echo "========================================"

VENV_PATH="/opt/venv"

if [ ! -d "$VENV_PATH" ]; then
    python3 -m venv "$VENV_PATH"
fi

"$VENV_PATH/bin/pip" install --upgrade pip
"$VENV_PATH/bin/pip" install -r /home/safeprint/dev/SafePrint/requirements.txt

# ========================================
# MYSQL INITIALIZATION
# ========================================
echo "[1/6] Starting MySQL..."

# Initialize MySQL data directory if empty
if [ ! -d "/var/lib/mysql/mysql" ]; then
    echo "Initializing MySQL data directory..."
    mysqld --initialize-insecure --user=mysql
fi

# Start MySQL
service mysql start

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
for i in {1..30}; do
    if mysqladmin ping -h localhost --silent 2>/dev/null; then
        break
    fi
    sleep 1
done

# Create database and user if not exists
mysql -u root <<-EOF
    CREATE DATABASE IF NOT EXISTS SAFEPRINT_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER IF NOT EXISTS 'SAFEPRINT_ADMIN'@'localhost' IDENTIFIED BY '@MYSQL_datugavinoperez1';
    GRANT ALL PRIVILEGES ON SAFEPRINT_DB.* TO 'SAFEPRINT_ADMIN'@'localhost';
    FLUSH PRIVILEGES;
EOF

echo "MySQL initialized and database created."

# ========================================
# IMPORT DATABASE DUMP IF EXISTS
# ========================================
if [ -f "/home/safeprint/dev/SafePrint/docker/data/database_dump.sql" ]; then
    echo "[2/6] Importing database dump..."
    mysql -u SAFEPRINT_ADMIN -p'@MYSQL_datugavinoperez1' SAFEPRINT_DB < /home/safeprint/dev/SafePrint/docker/data/database_dump.sql
    echo "Database imported successfully."
else
    echo "[2/6] No database dump found, running migrations..."
    cd /home/safeprint/dev/SafePrint
    source "$VENV_PATH/bin/activate"
    python manage.py migrate --noinput
    
    # Create default notification sounds
    python manage.py shell << 'PYTHON'
from portal.models import NotificationSound
if not NotificationSound.objects.exists():
    NotificationSound.objects.create(
        slug='chime',
        display_name='Chime',
        file_path='/static/sounds/chime.mp3',
        is_active=True
    )
    print("Default notification sound created.")
PYTHON
    
    echo "Migrations completed."
fi

# ========================================
# SETUP ENVIRONMENT FILE
# ========================================
echo "[3/6] Setting up environment variables..."

mkdir -p "$VENV_PATH"

if [ ! -f "$VENV_PATH/.env" ]; then
    cat > "$VENV_PATH/.env" << 'ENVFILE'
DJANGO_SECRET_KEY=your-secret-key-change-for-production
DB_NAME=SAFEPRINT_DB
DB_USER=SAFEPRINT_ADMIN
DB_PASSWORD=@MYSQL_datugavinoperez1
DB_HOST=localhost
DB_PORT=3306
ENVFILE
    echo "Environment file created."
fi

# ========================================
# COLLECT STATIC FILES
# ========================================
echo "[4/6] Collecting static files..."
cd /home/safeprint/dev/SafePrint
source "$VENV_PATH/bin/activate"
python manage.py collectstatic --noinput --clear

# ========================================
# SET PERMISSIONS
# ========================================
echo "[5/6] Setting permissions..."
chown -R safeprint:www-data /home/safeprint/dev/SafePrint
chmod -R 755 /home/safeprint/dev/SafePrint
chmod 775 /home/safeprint/dev/SafePrint/media
chmod 775 /home/safeprint/dev/SafePrint/logs

# ========================================
# START SERVICES
# ========================================
echo "[6/6] Starting services..."

# Start cron
service cron start

# Start supervisor (manages nginx, gunicorn, and printer polling)
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf -n
