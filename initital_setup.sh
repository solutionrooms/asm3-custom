#!/bin/bash

set -e

echo "=========================================="
echo "ASM3 Docker Setup Script"
echo "=========================================="

# Check if Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "ERROR: Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✓ Docker and Docker Compose are installed"

# Create project directory
PROJECT_DIR="asm3-bghr"
if [ -d "$PROJECT_DIR" ]; then
    echo "Directory $PROJECT_DIR already exists."
    read -p "Do you want to continue and overwrite files? [y/N]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 1
    fi
fi

mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

echo "✓ Created project directory: $PROJECT_DIR"

# Create directory structure
mkdir -p customizations/{src,static/{css,js,images},templates,patches}
mkdir -p init-db

echo "✓ Created directory structure"

# Create the example customization files
cat > customizations/README.md << 'EOF'
# ASM3 Customizations

This directory contains your custom modifications to ASM3.

## Directory Structure

- `src/` - Custom Python source files and modifications
- `static/` - Custom CSS, JavaScript, and images  
- `templates/` - Custom HTML templates
- `patches/` - Git patch files for core modifications
- `sitedefs.py` - Custom configuration (optional)

## Adding Customizations

1. **New Files**: Place new Python modules in `src/`
2. **Modified Files**: Copy the original file from ASM3, modify it, and place here
3. **Static Assets**: Add custom CSS/JS/images to `static/`
4. **Templates**: Add or override templates in `templates/`
5. **Core Changes**: Create patch files in `patches/`

To restart after changes: `make restart` or `docker-compose restart asm3`
EOF

# Create example CSS
cat > customizations/static/css/custom.css << 'EOF'
/* Custom ASM3 Styles */
.custom-header {
    background-color: #2c3e50;
    color: white;
    padding: 10px;
    text-align: center;
    font-weight: bold;
}

.custom-button {
    background-color: #3498db;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
}

.custom-button:hover {
    background-color: #2980b9;
}
EOF

# Create example JavaScript
cat > customizations/static/js/custom.js << 'EOF'
// Custom ASM3 JavaScript
console.log('ASM3 Custom modifications loaded');

document.addEventListener('DOMContentLoaded', function() {
    // Example: Add custom header
    const header = document.createElement('div');
    header.className = 'custom-header';
    header.textContent = 'Custom ASM3 Installation';
    
    // Insert at the top of the body
    if (document.body.firstChild) {
        document.body.insertBefore(header, document.body.firstChild);
    } else {
        document.body.appendChild(header);
    }
    
    console.log('Custom features initialized');
});
EOF

# Create example Python module
cat > customizations/src/custom_utils.py << 'EOF'
#!/usr/bin/env python3
"""
Custom utilities for ASM3
"""

import os

def custom_function():
    """Example custom function"""
    return "Hello from custom ASM3!"

def get_custom_setting(setting_name, default_value=None):
    """Get custom setting from environment"""
    return os.environ.get(f'CUSTOM_{setting_name.upper()}', default_value)

def enhanced_animal_name(animal_name, animal_id):
    """Example function to enhance animal names"""
    return f"{animal_name} (ID: {animal_id})"
EOF

# Create database init script
cat > init-db/01-init.sql << 'EOF'
-- Custom database initialization for ASM3
-- This runs when the database is first created

-- Log initialization
SELECT 'Custom ASM3 database initialization completed' AS status;
EOF

echo "✓ Created example customization files"

# Create environment file
cat > .env << 'EOF'
# ASM3 Version Control
ASM3_VERSION=v49

# ASM3 Database Configuration
ASM3_DBTYPE=POSTGRESQL
ASM3_DBHOST=db
ASM3_DBPORT=5432
ASM3_DBNAME=asm3
ASM3_DBUSERNAME=asm3
ASM3_DBPASSWORD=asm3password

# Application Configuration
ASM3_DEBUG=false
ASM3_LOGLEVEL=INFO

# Custom Configuration
CUSTOM_FEATURE_ENABLED=true
EOF

echo "✓ Created .env file"

# Make the setup script set up the version check script too
cat > check-versions.sh << 'EOF'
#!/bin/bash

echo "========================================"
echo "ASM3 Version Information"
echo "========================================"

# Check current configured version
echo "📌 Current configured version:"
if [ -f ".env" ]; then
    CURRENT_VERSION=$(grep "ASM3_VERSION=" .env | cut -d= -f2)
    echo "   $CURRENT_VERSION (from .env file)"
else
    echo "   No .env file found"
fi

echo ""

# Check running container version
echo "🐳 Running container version:"
if docker-compose ps asm3 | grep -q "Up"; then
    CONTAINER_VERSION=$(docker-compose exec asm3 cat /app/VERSION 2>/dev/null | tr -d '\r\n')
    if [ -n "$CONTAINER_VERSION" ]; then
        echo "   $CONTAINER_VERSION"
    else
        echo "   Unable to determine (VERSION file not found)"
    fi
else
    echo "   Container not running"
fi

echo ""

# Check latest releases
echo "🚀 Recent ASM3 releases:"
echo "   Fetching from GitHub..."

RECENT_VERSIONS=$(git ls-remote --tags https://github.com/sheltermanager/asm3.git 2>/dev/null | \
    grep -E "refs/tags/v[0-9]+" | \
    sed 's/.*refs\/tags\///' | \
    sort -V | \
    tail -5)

if [ -n "$RECENT_VERSIONS" ]; then
    echo "$RECENT_VERSIONS" | while read version; do
        if [ "$version" = "$CURRENT_VERSION" ]; then
            echo "   $version ← Current"
        else
            echo "   $version"
        fi
    done
else
    echo "   Unable to fetch versions (check internet connection)"
fi

echo ""

# Check if update is available
echo "💡 Update status:"
LATEST_VERSION=$(echo "$RECENT_VERSIONS" | tail -1)
if [ -n "$LATEST_VERSION" ] && [ -n "$CURRENT_VERSION" ]; then
    if [ "$CURRENT_VERSION" = "$LATEST_VERSION" ]; then
        echo "   ✅ You're running the latest version!"
    else
        echo "   📦 Newer version available: $LATEST_VERSION"
        echo "   Run 'make upgrade' to update"
    fi
else
    echo "   ❓ Unable to determine update status"
fi

echo ""
echo "Commands:"
echo "  make version       - Show detailed version info"
echo "  make list-versions - List all available versions"  
echo "  make upgrade       - Interactive upgrade process"
echo "========================================"
EOF

chmod +x check-versions.sh

echo "✓ Created version management script"

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Navigate to the project directory:"
echo "   cd $PROJECT_DIR"
echo ""
echo "2. Start ASM3:"
echo "   make start"
echo "   # or: docker-compose up -d"
echo ""
echo "3. Access ASM3 in your browser:"
echo "   http://localhost:5000"
echo ""
echo "4. Add your customizations to the customizations/ directory"
echo ""
echo "5. After making changes, restart:"
echo "   make restart"
echo ""
echo "Version Management:"
echo "  ./check-versions.sh  - Check current and available versions"
echo "  make version         - Show version details"
echo "  make upgrade         - Upgrade to newer version"
echo ""
echo "Useful commands:"
echo "  make help      - Show all available commands"
echo "  make logs      - View application logs"
echo "  make backup    - Backup the database"
echo "  make clean     - Remove everything (WARNING: destroys data)"
echo ""
echo "For more information, see README.md"