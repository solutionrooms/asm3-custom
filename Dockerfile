FROM python:3.9-slim AS runtime

# Install system dependencies including make, Node.js, and all optional ASM3 packages (system tools only)
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    default-libmysqlclient-dev \
    libcairo2 \
    libcairo2-dev \
    pkg-config \
    rsync \
    make \
    nodejs \
    npm \
    gettext-base \
    cron \
    procps \
    imagemagick \
    exuberant-ctags \
    texlive-latex-base \
    texlive-latex-extra \
    latexmk \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install wkhtmltopdf from official releases since it's not in Debian repos
RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then \
        wget -q https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.bullseye_amd64.deb \
        && dpkg -i wkhtmltox_0.12.6.1-3.bullseye_amd64.deb || apt-get install -f -y \
        && rm wkhtmltox_0.12.6.1-3.bullseye_amd64.deb; \
    elif [ "$ARCH" = "arm64" ]; then \
        wget -q https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.bullseye_arm64.deb \
        && dpkg -i wkhtmltox_0.12.6.1-3.bullseye_arm64.deb || apt-get install -f -y \
        && rm wkhtmltox_0.12.6.1-3.bullseye_arm64.deb; \
    else \
        echo "wkhtmltopdf not available for architecture $ARCH"; \
    fi

# Create app directory
WORKDIR /app

# Copy ASM3 source code and build tooling from local repository
COPY ./src /app/src/
COPY ./scripts /app/scripts/
COPY ./VERSION /app/
COPY ./package.json /app/
COPY ./Makefile /app/

# Run ASM3 build process to generate __version__.py and other build artifacts
RUN cd /app && npm install && \
    echo "#!/usr/bin/env python3" > src/asm3/__version__.py && \
    echo "VERSION = \"`cat VERSION` [Custom Build `date`]\"" >> src/asm3/__version__.py && \
    echo "BUILD = \"`date +%m%d%H%M%S`\"" >> src/asm3/__version__.py && \
    make o_rollup

# Install Python dependencies (all via pip to ensure compatibility)
RUN pip install --no-cache-dir \
    cheroot \
    pillow \
    psycopg2-binary \
    pymysql \
    requests \
    lxml \
    python-memcached \
    boto3 \
    pyflakes \
    pylint \
    xhtml2pdf \
    reportlab \
    openpyxl \
    qrcode \
    stripe \
    kombu \
    sphinx \
    sphinx-rtd-theme \
    matplotlib \
    anthropic

# Note: Customization script removed - using direct source approach

# Create directories for customizations, media, and cron
RUN mkdir -p /app/customizations /app/media /app/scripts /var/log/asm3

# Note: sitedefs.py already included in ./src copy

# Copy weight monitor script
COPY weight_monitor.py /app/
RUN chmod +x /app/weight_monitor.py

# Create directory for ASM3 configuration (will be provided via volume mount)
RUN mkdir -p /etc

# Expose the application port
EXPOSE 5000

# Process config file and start ASM3
WORKDIR /app/src
CMD ["python3", "main.py", "5000"]
