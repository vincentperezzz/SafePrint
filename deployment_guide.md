# SafePrint Deployment Guide

This guide explains how to deploy your SafePrint Django application with Nginx and Gunicorn.

## 1. Install Required Packages

```bash
# Install Gunicorn in your Python virtual environment
cd /home/safeprint/dev/SafePrint
source venv/bin/activate  # Activate your virtual environment
pip install gunicorn

# Add to requirements.txt
echo "gunicorn" >> requirements.txt
```

## 2. Create Log Directory for Gunicorn

```bash
# Create log directory
sudo mkdir -p /var/log/gunicorn
sudo chown safeprint:www-data /var/log/gunicorn
```

## 3. Install and Configure the Systemd Service

```bash
# Copy the service file to systemd
sudo cp /home/safeprint/dev/SafePrint/safeprint.service /etc/systemd/system/

# Start the service
sudo systemctl daemon-reload
sudo systemctl start safeprint
sudo systemctl enable safeprint  # Enable to start on boot

# Check the status
sudo systemctl status safeprint
```

## 4. Test the Nginx Configuration

```bash
# Test the Nginx configuration
sudo nginx -t

# If successful, reload Nginx
sudo systemctl reload nginx
```

## 5. Troubleshooting

If you encounter issues:

### Check Gunicorn Logs
```bash
sudo tail -f /var/log/gunicorn/safeprint-error.log
sudo tail -f /var/log/gunicorn/safeprint-access.log
```

### Check Nginx Logs
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Check the Socket File
```bash
ls -l /home/safeprint/dev/SafePrint/safeprint.sock
```

### Restart Services
```bash
sudo systemctl restart safeprint
sudo systemctl reload nginx
```

## 6. Additional Notes

- Make sure file permissions are correct
- Ensure your Django settings are configured for production
- Remember to set DEBUG=False in your .env file
- Run `python manage.py collectstatic` when you update static files




