#!/bin/bash
set -e

# SafePrint Gunicorn Startup Script for Docker
# Mirrors the production gunicorn_start.sh configuration

# Define variables (matching production)
NAME="safeprint"
DJANGODIR=/home/safeprint/dev/SafePrint
USER=safeprint
GROUP=www-data
WORKERS=3
BIND=unix:/home/safeprint/dev/SafePrint/safeprint.sock
DJANGO_SETTINGS_MODULE=SafePrint.settings
DJANGO_WSGI_MODULE=SafePrint.wsgi
LOG_LEVEL=debug

cd $DJANGODIR
source /opt/venv/bin/activate

# Export Django settings
export DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS_MODULE
export PYTHONPATH=$DJANGODIR:$PYTHONPATH

# Create the socket directory if it doesn't exist and set proper permissions
SOCKET_DIR=$(dirname $BIND | sed 's/unix://')
if [ ! -d "$SOCKET_DIR" ] && [ "$SOCKET_DIR" != "" ]; then
  mkdir -p $SOCKET_DIR
fi

# Remove stale socket file if exists
if [ -e "/home/safeprint/dev/SafePrint/safeprint.sock" ]; then
  rm -f /home/safeprint/dev/SafePrint/safeprint.sock
fi

# Create the run directory if it doesn't exist
if [ ! -d /var/log/gunicorn ]; then
  mkdir -p /var/log/gunicorn
fi

echo "Starting $NAME as $(whoami)"

# Start Gunicorn
exec gunicorn ${DJANGO_WSGI_MODULE}:application \
  --name $NAME \
  --workers $WORKERS \
  --worker-class gevent \
  --reload \
  \
  --bind=$BIND \
  --log-level=$LOG_LEVEL \
  --log-file=/var/log/gunicorn/safeprint-error.log \
  --access-logfile=/var/log/gunicorn/safeprint-access.log
