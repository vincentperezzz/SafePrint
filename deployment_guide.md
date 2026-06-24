# SafePrint Deployment Guide

This guide covers installation, local development, and production deployment of the SafePrint Django application.

---

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/vincentperezzz/SafePrint.git
   ```

2. Navigate to the project directory:
   ```
   cd SafePrint
   ```

3. Set the execution policy (Windows only):
   Run the following command in PowerShell to allow script execution:
   ```
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```

4. Install MySQL:
   Use the Windows Package Manager (`winget`) to install MySQL:
   ```
   winget install --id Oracle.MySQL
   ```
   Alternatively, download and install MySQL manually from [MySQL Downloads](https://dev.mysql.com/downloads/installer/).

5. Configure the `.env` file:
   Create a `.env` file inside the `venv` folder with the following content:
   ```
   DJANGO_SECRET_KEY=your-secret-key
   DB_NAME=your_database_name
   DB_USER=your_database_user
   DB_PASSWORD=your_database_password
   DB_HOST=localhost
   DB_PORT=3306
   ```

6. Install dependencies:
   Activate the virtual environment and install the required Python packages:
   ```
   python -m venv venv
   ```
   ```
   venv\Scripts\activate
   ```
   ```
   pip install -r requirements.txt
   ```

7. Apply migrations:
   Run the following commands to set up the database schema:
   ```
   python manage.py makemigrations
   ```
   ```
   python manage.py migrate
   ```

8. Start the development server:
   ```
   python manage.py runserver
   ```

9. Create a superuser (optional):
   If you want to access the admin interface, create a superuser account:
   ```
   python manage.py createsuperuser
   ```

10. Create Manager account (only for fresh installations):
    ```
      python manage.py shell
      ```
      Then run the following commands in the Django shell:
      ```python
      from portal.models import AdminUser
      from django.contrib.auth.hashers import make_password

      AdminUser.objects.create(
          name='Manager Name',
          username='manager',
          password=make_password('your_secure_password'),
          role='Manager'
      )
      ```

11. Access the application:
   Open your browser and navigate to `http://127.0.0.1:8000/`.

## Database Setup

1. **Install MySQL Workbench**:
   Download and install MySQL Workbench from [MySQL Workbench Downloads](https://dev.mysql.com/downloads/workbench/).

2. **Create the Database**:
   - Open MySQL Workbench and connect to your MySQL server.
   - Create the database and tables

3. **Apply Migrations**:
   Run the following commands to apply migrations:
   ```
   python manage.py makemigrations
   python manage.py migrate
   ```

## Notes

- Ensure MySQL is running before starting the Django server.
- The `.env` file is excluded from version control for security purposes.

## Usage

1. Run the migrations:
   ```
   python manage.py migrate
   ```

2. Start the development server:
   ```
   python manage.py runserver
   ```

3. Access the application at `http://127.0.0.1:8000/`.

## Linux Server Setup & Usage

Follow these steps to run SafePrint on a Linux server (e.g., Ubuntu-Server-LTS):

1. **SSH into your server:**
   ```sh
   ssh your_username@your_server_ip
   ```

2. **Navigate to the project directory:**
   ```sh
   cd /dev/SafePrint
   ```

3. **Activate the Python virtual environment:**
   ```sh
   . venv/bin/activate
   ```

4. **Run the Django development server:**
   ```sh
   python manage.py runserver 0.0.0.0:8080
   ```
   Access the app at `http://your_server_ip:8080/`

5. **Update code from Git (if changes are made):**
   ```sh
   git pull
   ```

---

## Production Deployment

The sections below cover deploying SafePrint with Nginx, Gunicorn, and supporting services.

## Install Required Packages

```bash
# Install Gunicorn in your Python virtual environment
cd /home/safeprint/dev/SafePrint
source venv/bin/activate  # Activate your virtual environment
pip install gunicorn

# Add to requirements.txt
echo "gunicorn" >> requirements.txt
```

## Create Log Directory for Gunicorn

```bash
# Create log directory
sudo mkdir -p /var/log/gunicorn
sudo chown safeprint:www-data /var/log/gunicorn
```

## Install and Configure the Systemd Service

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

## Printer Installation Guide (Linux/CUPS)

### Download the Brother Printer Driver

- Visit the official Brother support page for your printer model.
- Alternatively, use the following command to download the installer (replace `<model>` with your actual printer model, e.g., HL-L2350DW):

```bash
cd ~/Documents
curl -O https://download.brother.com/welcome/dlf006893/linux-brprinter-installer-2.2.3-1.gz
```

### Extract and Run the Installer

```bash
gunzip linux-brprinter-installer-2.2.3-1.gz
sudo bash linux-brprinter-installer-2.2.4-1 DCP-T510W
```
- When prompted, enter your printer model (e.g., HL-L2350DW).
- Follow the on-screen instructions to complete the installation.

### Select Device URI

- During installation, you may be asked to select the Device URI.
- Choose the correct connection type (USB, network, etc.).
- For network printers, select the URI that matches your printer's IP address.

### Test the Printer

- After installation, verify the printer is recognized:

```bash
lpstat -p
```
- Send a test print:

```bash
lp -d DCPT510W /etc/nsswitch.conf
```
```
sudo lpadmin -p Brother_DCP_T820DW -E -v ipp://192.168.0.102/ipp/print -m everywhere
```
- Replace `<DCPT510W>` with the name shown by `lpstat -p`.

### Troubleshooting for Printer

- If you need to rename the printer:

```bash
sudo lpadmin -p <old_name> -R printer-info -D "New Printer Name"
```
- Access the CUPS web interface at http://localhost:631 for advanced configuration.

---

**Note:** For other printer models, download the appropriate driver from the manufacturer's website and follow similar steps.

## Configure Nginx Site

```bash
sudo cp /home/safeprint/dev/SafePrint/nginx.conf /etc/nginx/sites-available/safeprint.com && sudo ln -sf /etc/nginx/sites-available/safeprint.com /etc/nginx/sites-enabled/safeprint.com && sudo nginx -t && sudo systemctl reload nginx
```


### Verify ChaCha20 Cipher and SSL Digital Signature
To verify that your server supports ChaCha20 encryption and your SSL certificate is valid:

#### Check ChaCha20 Cipher Support
```bash
openssl s_client -connect safeprint.duckdns.org:443 -cipher 'ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305' -tls1_2
```
- If the connection is successful and you see a line like `Cipher    : ECDHE-RSA-CHACHA20-POLY1305`, then ChaCha20 is enabled and working.

#### Check SSL Certificate Digital Signature
```bash
openssl s_client -connect safeprint.duckdns.org:443 -tls1_2
```
- Look for the `Signature Algorithm` in the certificate details to verify the digital signature is present and valid.

## Quick Deploy (Static + Gunicorn Reload)

Use this one-liner after editing CSS, JS, templates, or Python code to push changes live:

```bash
# Copy all static assets and gracefully reload Gunicorn (zero-downtime)
cd /home/safeprint/dev/SafePrint && \
  cp -r static/css/* staticfiles/css/ && \
  cp -r static/js/* staticfiles/js/ && \
  cp -r static/assets/* staticfiles/assets/ && \
  cp -r static/sounds/* staticfiles/sounds/ && \
  kill -HUP $(pgrep -f 'gunicorn.*SafePrint' | head -1)
```

**What it does:**
- Copies the entire `static/` tree into `staticfiles/` (CSS, JS, assets, sounds)
- Sends `SIGHUP` to the Gunicorn master process for a graceful worker reload (no downtime)
- Templates are served directly by Django, so they take effect on the next request after the HUP

> **Tip:** For Python-only changes (views, models, etc.), you only need the `kill -HUP` part.
> For static-only changes (CSS/JS), you only need the `cp` commands — but the HUP doesn't hurt.

## Additional Notes

- Make sure file permissions are correct
- Ensure your Django settings are configured for production
- Remember to set DEBUG=False in your .env file
- Use the Quick Deploy command above instead of `python manage.py collectstatic` for faster iteration
- Always clear Python bytecode cache after making code changes
- Use graceful reload (`kill -HUP`) for minimal downtime — avoids dropping in-flight requests


## Enable HTTPS with DuckDNS and Let's Encrypt

### Install Certbot

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

### Open Firewall Ports

```bash
sudo ufw allow 80
sudo ufw allow 443
```

### Request SSL Certificate

```bash
sudo certbot --nginx -d safeprint.duckdns.org
```
Follow the prompts to complete the certificate setup.

### Update Nginx Configuration

Edit `/etc/nginx/sites-available/safeprint.com` to use SSL:

```nginx
server {
    listen 80;
    server_name safeprint.duckdns.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name safeprint.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/safeprint.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/safeprint.duckdns.org/privkey.pem;

    location / {
        proxy_pass http://unix:/home/safeprint/dev/SafePrint/safeprint.sock;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Reload Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Test Your Site

Open your browser and go to:
```
https://nanoprint.duckdns.org
```
You should see your SafePrint app with a secure connection.

## SSL Certificate Renewal

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

## DuckDNS DNS Challenge (Manual or Automated)

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

- Make sure the script is executable:
   ```
   chmod +x /home/safeprint/dev/SafePrint/scripts/poll_printers_daemon.sh
   ```

- Install the cron job by editing your crontab:
   ```
   crontab -e
   ```

- Add these lines:
   ```
   @reboot /home/safeprint/dev/SafePrint/scripts/poll_printers_daemon.sh
   @hourly /home/safeprint/dev/SafePrint/scripts/poll_printers_daemon.sh
   ```

- Save and exit the editor

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

- Stop Gunicorn
   If Gunicorn is running as a systemd service:
   ```bash
   sudo systemctl stop safeprint
   pkill gunicorn
   ```

- Run Django Development Server
   Activate your virtual environment and start the server:
   ```bash
   cd /home/safeprint/dev/SafePrint
   source venv/bin/activate
   python manage.py runserver 0.0.0.0:8000
   ```
   This will start Django on port 8000 and show debugging output in your terminal and browser.

- Access the Site
   Open your browser and go to:
   ```
   http://localhost:8000
   ```

- Restore Gunicorn
   When finished debugging, stop the development server (Ctrl+C) and restart Gunicorn:
   ```bash
   sudo systemctl start safeprint
   ```

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

**Note:** The Django development server is for debugging only and should not be used in production.




