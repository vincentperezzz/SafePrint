# SafePrint Development Environment - Ubuntu-based Docker Image
# Replicates the complete production SafePrint Vendo server environment
FROM ubuntu:22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set locale
RUN apt-get update && apt-get install -y locales && \
    locale-gen en_US.UTF-8 && \
    update-locale LANG=en_US.UTF-8

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# Install system dependencies
RUN apt-get update && apt-get install -y \
    # Python and development tools
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    # MySQL client and libraries
    mysql-server \
    mysql-client \
    libmysqlclient-dev \
    # Nginx and Gunicorn dependencies
    nginx \
    # System tools
    git \
    curl \
    wget \
    vim \
    nano \
    htop \
    supervisor \
    cron \
    # PDF and image processing dependencies
    poppler-utils \
    libpoppler-cpp-dev \
    # SNMP tools for printer monitoring
    snmp \
    snmp-mibs-downloader \
    # Printing system (CUPS)
    cups \
    cups-client \
    # SSL/TLS tools
    openssl \
    ca-certificates \
    # Build tools
    build-essential \
    pkg-config \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create safeprint user (same as production)
RUN useradd -m -s /bin/bash safeprint && \
    usermod -aG www-data safeprint && \
    usermod -aG sudo safeprint

# Create directory structure (matching production)
RUN mkdir -p /home/safeprint/dev && \
    mkdir -p /var/log/gunicorn && \
    mkdir -p /var/log/nginx && \
    mkdir -p /var/log/safeprint && \
    chown -R safeprint:www-data /home/safeprint && \
    chown -R safeprint:www-data /var/log/gunicorn

# Set working directory
WORKDIR /home/safeprint/dev/SafePrint

# Copy requirements first for better caching
COPY requirements.txt /tmp/requirements.txt

# Create virtual environment and install dependencies
RUN python3 -m venv /home/safeprint/dev/SafePrint/venv && \
    /home/safeprint/dev/SafePrint/venv/bin/pip install --upgrade pip && \
    /home/safeprint/dev/SafePrint/venv/bin/pip install -r /tmp/requirements.txt

# Copy application code
COPY --chown=safeprint:www-data . /home/safeprint/dev/SafePrint/

# Copy Docker-specific configurations
COPY docker/config/nginx-docker.conf /etc/nginx/sites-available/safeprint
COPY docker/config/supervisord.conf /etc/supervisor/conf.d/safeprint.conf
COPY docker/config/gunicorn_docker.sh /home/safeprint/dev/SafePrint/gunicorn_docker.sh
COPY docker/config/docker-entrypoint.sh /entrypoint.sh

# Set up cron jobs
COPY docker/config/crontab /etc/cron.d/safeprint-cron
RUN chmod 0644 /etc/cron.d/safeprint-cron

# Setup MySQL (will be initialized in entrypoint)
RUN mkdir -p /var/run/mysqld && \
    chown -R mysql:mysql /var/run/mysqld && \
    chmod 755 /var/run/mysqld

# Set proper permissions
RUN chmod +x /home/safeprint/dev/SafePrint/gunicorn_docker.sh && \
    chmod +x /entrypoint.sh && \
    chmod +x /home/safeprint/dev/SafePrint/scripts/poll_printers_daemon.sh && \
    chown -R safeprint:www-data /home/safeprint/dev/SafePrint

# Configure Nginx
RUN rm -f /etc/nginx/sites-enabled/default && \
    ln -sf /etc/nginx/sites-available/safeprint /etc/nginx/sites-enabled/safeprint

# Expose ports
EXPOSE 80 443 8000 3306

# Volume mounts for persistent data
VOLUME ["/home/safeprint/dev/SafePrint/media", "/home/safeprint/dev/SafePrint/logs", "/var/lib/mysql"]

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]
