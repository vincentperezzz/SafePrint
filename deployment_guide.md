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

## 4. Configure Nginx Site

```bash
sudo cp /home/safeprint/dev/SafePrint/nginx.conf /etc/nginx/sites-available/nanoprint.com && sudo ln -sf /etc/nginx/sites-available/nanoprint.com /etc/nginx/sites-enabled/nanoprint.com && sudo nginx -t && sudo systemctl reload nginx
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


## 7. Enable HTTPS with DuckDNS and Let's Encrypt

### 1. Install Certbot

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

### 2. Open Firewall Ports

```bash
sudo ufw allow 80
sudo ufw allow 443
```

### 3. Request SSL Certificate

```bash
sudo certbot --nginx -d nanoprint.duckdns.org
```
Follow the prompts to complete the certificate setup.

### 4. Update Nginx Configuration

Edit `/etc/nginx/sites-available/nanoprint.com` to use SSL:

```nginx
server {
    listen 80;
    server_name nanoprint.duckdns.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name nanoprint.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/nanoprint.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nanoprint.duckdns.org/privkey.pem;

    location / {
        proxy_pass http://unix:/home/safeprint/dev/SafePrint/safeprint.sock;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5. Reload Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Test Your Site

Open your browser and go to:
```
https://nanoprint.duckdns.org
```
You should see your SafePrint app with a secure connection.

## 8. SSL Certificate Renewal

Let's Encrypt certificates are valid for 90 days. Certbot can automatically renew them using a systemd timer or a cron job.

### Check Certbot Systemd Timer (Recommended)
Certbot installs a systemd timer by default. To check its status:
```bash
sudo systemctl status certbot.timer
```
If active, renewal is automatic.

### Manual Renewal (if needed)
You can manually renew your certificate at any time:
```bash
sudo certbot renew
```

### Cron Job (Alternative)
To add a cron job for renewal, run:
```bash
sudo crontab -e
```
Add this line:
```
0 0,12 * * * certbot renew --quiet --deploy-hook "systemctl reload nginx"
```
This will renew certificates twice daily and reload Nginx if renewed.

## 9. DuckDNS DNS Challenge (Manual or Automated)

If you use the DNS challenge for Let's Encrypt (for example, if you cannot open port 80), you need to set a TXT record in DuckDNS for your domain.

### Steps to Obtain DuckDNS Token and Set TXT Record

1. Go to https://www.duckdns.org and log in with your account.
2. Find your DuckDNS token on your dashboard (it looks like: `71169366-fe79-4ed6-8aa2-429a100c7898`).
3. When Certbot asks for a TXT record, use the following format to set it:
   ```
   https://www.duckdns.org/update?domains=nanoprint&token=YOUR_TOKEN&txt=YOUR_TXT_VALUE&verbose=true&clear=false
   ```
   - Replace `YOUR_TOKEN` with your DuckDNS token.
   - Replace `YOUR_TXT_VALUE` with the value Certbot provides (example: `N2IA6OjUd64wpnUE1gbgiwxbxs0QvtxU14LyIqAj5rM`).
4. Open the link in your browser or use `curl`:
   ```bash
   curl "https://www.duckdns.org/update?domains=nanoprint&token=YOUR_TOKEN&txt=YOUR_TXT_VALUE&verbose=true&clear=false"
   ```
5. Wait a few seconds for DNS propagation, then continue with Certbot.

For automation, see the earlier section about using a shell script with Certbot's `--manual-auth-hook`.




