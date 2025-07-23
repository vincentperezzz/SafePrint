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

### Clear Python Bytecode Cache (After Code Changes)
When your code changes aren't being reflected after deployment:

```bash
#### Clears Cache and Restart Gunicorn and Nginx
cd /home/safeprint/dev/SafePrint
find . -name "*.pyc" -delete
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete && find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

pkill -HUP gunicorn

sudo systemctl stop safeprint && sleep 2 && sudo systemctl start safeprint

find . -name "*.pyc" -delete && find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
source venv/bin/activate
python manage.py collectstatic --noinput
sudo systemctl restart safeprint
sudo systemctl restart nginx
```

### Clear Static Files Cache
```bash
cd /home/safeprint/dev/SafePrint
source venv/bin/activate
python manage.py collectstatic --noinput --clear
```

### Verify ChaCha20 Cipher and SSL Digital Signature
To verify that your server supports ChaCha20 encryption and your SSL certificate is valid:

#### 1. Check ChaCha20 Cipher Support
```bash
openssl s_client -connect nanoprint.duckdns.org:443 -cipher 'ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305' -tls1_2
```
- If the connection is successful and you see a line like `Cipher    : ECDHE-RSA-CHACHA20-POLY1305`, then ChaCha20 is enabled and working.

#### 2. Check SSL Certificate Digital Signature
```bash
openssl s_client -connect nanoprint.duckdns.org:443 -tls1_2
```
- Look for the `Signature Algorithm` in the certificate details to verify the digital signature is present and valid.

## 6. Additional Notes

- Make sure file permissions are correct
- Ensure your Django settings are configured for production
- Remember to set DEBUG=False in your .env file
- Run `python manage.py collectstatic` when you update static files
- Always clear Python bytecode cache after making code changes
- Use graceful reload (`pkill -HUP gunicorn`) for minimal downtime


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


## SNMP: Install and Query Brother Printer

To install SNMP tools and get information from your Brother printer (IP: 192.168.0.101):

```bash
sudo apt update
sudo apt install snmp snmp-mibs-downloader
```

To get general info from the printer:
```bash
snmpwalk -v2c -c public 192.168.0.101
```

To get the printer's model name:
```bash
snmpget -v2c -c public 192.168.0.101 iso.3.6.1.2.1.25.3.2.1.3.1 
```

To get printer status:
```bash
snmpget -v2c -c public 192.168.0.101 iso.3.6.1.2.1.43.18.1.1.8.1.1 
```

To get the Node name:
```bash
snmpget -v2c -c public 192.168.0.101 iso.3.6.1.2.1.1.5.0 
```

## Printer Polling Setup

This is a simple setup to poll printers for status every second using cron.

### How it Works

1. A single shell script (`poll_printers_daemon.sh`) runs as a daemon process
2. The script polls printers every 1 second using the existing Django management command
3. Cron starts this daemon on system reboot and hourly as a failsafe
4. The script prevents multiple instances from running

### How to Install

1. Make sure the script is executable:
   ```
   chmod +x /home/safeprint/dev/SafePrint/scripts/poll_printers_daemon.sh
   ```

2. Install the cron job by editing your crontab:
   ```
   crontab -e
   ```

3. Add these lines:
   ```
   @reboot /home/safeprint/dev/SafePrint/scripts/poll_printers_daemon.sh
   @hourly /home/safeprint/dev/SafePrint/scripts/poll_printers_daemon.sh
   ```

4. Save and exit the editor

### How to Test

You can test the daemon manually:

```
/home/safeprint/dev/SafePrint/scripts/poll_printers_daemon.sh
```

To stop it, press Ctrl+C or find its process ID and kill it:

```
ps aux | grep poll_printers_daemon
kill <PID>
```

## Troubleshooting

Check the log file for any issues:

```
tail -f /home/safeprint/dev/SafePrint/logs/printer_polling.log
```

## Debugging with Django Development Server

If you need to debug your Django application, you can temporarily stop Gunicorn and run the built-in Django development server. This allows you to see detailed error messages and debugging output.

### Steps:

1. **Stop Gunicorn**
   If Gunicorn is running as a systemd service:
   ```bash
   sudo systemctl stop safeprint
   ```
   Or, if you started Gunicorn manually, use:
   ```bash
   pkill gunicorn
   ```

2. **Run Django Development Server**
   Activate your virtual environment and start the server:
   ```bash
   cd /home/safeprint/dev/SafePrint
   source venv/bin/activate
   python manage.py runserver 0.0.0.0:8080
   ```
   This will start Django on port 8080 and show debugging output in your terminal and browser.

3. **Access the Site**
   Open your browser and go to:
   ```
   http://<server_ip>:8080
   ```

4. **Restore Gunicorn**
   When finished debugging, stop the development server (Ctrl+C) and restart Gunicorn:
   ```bash
   sudo systemctl start safeprint
   ```

**Note:** The Django development server is for debugging only and should not be used in production.




