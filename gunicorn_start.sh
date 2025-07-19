#!/bin/bash
set -e

# Define variables
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
source venv/bin/activate

# Export Django settings
export DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS_MODULE
export PYTHONPATH=$DJANGODIR:$PYTHONPATH

# Create the socket directory if it doesn't exist and set proper permissions
SOCKET_DIR=$(dirname $BIND)
if [ ! -d $SOCKET_DIR ]; then
  mkdir -p $SOCKET_DIR
fi
chmod 775 $SOCKET_DIR

# Create the run directory if it doesn't exist
if [ ! -d /var/log/gunicorn ]; then
  mkdir -p /var/log/gunicorn
fi

echo "Starting $NAME as `whoami`"

# Start Gunicorn
exec gunicorn ${DJANGO_WSGI_MODULE}:application \
  --name $NAME \
  --workers $WORKERS \
  --worker-class gevent \
  --user=$USER \
  --group=$GROUP \
  --bind=$BIND \
  --log-level=$LOG_LEVEL \
  --log-file=/var/log/gunicorn/safeprint-error.log \
  --access-logfile=/var/log/gunicorn/safeprint-access.log