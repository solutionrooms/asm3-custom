FROM python:3.9-slim AS runtime

# Install system dependencies including make and Node.js
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    default-libmysqlclient-dev \
    pkg-config \
    rsync \
    make \
    nodejs \
    npm \
    gettext-base \
    cron \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy ASM3 source code from local repository
COPY ./src /app/src/
COPY ./VERSION /app/
COPY ./package.json /app/

# Run ASM3 build process to generate __version__.py and other build artifacts
RUN cd /app && npm install && \
    echo "#!/usr/bin/env python3" > src/asm3/__version__.py && \
    echo "VERSION = \"`cat VERSION` [Custom Build `date`]\"" >> src/asm3/__version__.py && \
    echo "BUILD = \"`date +%m%d%H%M%S`\"" >> src/asm3/__version__.py

# Install Python dependencies
RUN pip install --no-cache-dir \
    cheroot \
    pillow \
    psycopg2-binary \
    pymysql \
    requests \
    lxml \
    python-memcached

# Note: Customization script removed - using direct source approach

# Create directories for customizations, media, and cron
RUN mkdir -p /app/customizations /app/media /app/scripts /var/log/asm3

# Note: sitedefs.py already included in ./src copy

# Copy weight monitor script
COPY weight_monitor.py /app/
RUN chmod +x /app/weight_monitor.py

# Create ASM3 configuration file
RUN mkdir -p /etc && \
    echo "# ASM3 Configuration" > /etc/asm3.conf && \
    echo "asm3_dbtype = POSTGRESQL" >> /etc/asm3.conf && \
    echo "asm3_dbhost = db" >> /etc/asm3.conf && \
    echo "asm3_dbport = 5432" >> /etc/asm3.conf && \
    echo "asm3_dbname = asm3" >> /etc/asm3.conf && \
    echo "asm3_dbusername = asm3" >> /etc/asm3.conf && \
    echo "asm3_dbpassword = asm3" >> /etc/asm3.conf

# Expose the application port
EXPOSE 5000

# Process config file and start ASM3
WORKDIR /app/src
CMD ["python3", "main.py", "5000"]