#!/bin/bash
# ========================================
# SafePrint Docker Setup Script
# One-click setup for the complete development environment
# ========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          SafePrint Docker Development Environment            ║"
echo "║                  One-Click Setup Script                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    echo ""
    echo "Please install Docker first:"
    echo "  Ubuntu/Debian: sudo apt-get install docker.io docker-compose"
    echo "  Mac: Download Docker Desktop from https://docker.com"
    echo "  Windows: Download Docker Desktop from https://docker.com"
    exit 1
fi

echo "✓ Docker is installed"

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed!"
    echo ""
    echo "Please install Docker Compose:"
    echo "  Ubuntu/Debian: sudo apt-get install docker-compose"
    exit 1
fi

echo "✓ Docker Compose is available"
echo ""

# Navigate to docker directory
cd "$SCRIPT_DIR"

# Check for database dump
if [ -f "$SCRIPT_DIR/data/database_dump.sql" ]; then
    echo "✓ Database dump found - will import during startup"
else
    echo "⚠ No database dump found at docker/data/database_dump.sql"
    echo "  The container will start with a fresh database"
    echo "  Run ./export_database.sh on the source server to create one"
    echo ""
fi

# Build the Docker image
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Building Docker image..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if docker compose version &> /dev/null; then
    docker compose build
else
    docker-compose build
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Starting SafePrint container..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if docker compose version &> /dev/null; then
    docker compose up -d
else
    docker-compose up -d
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Waiting for services to start..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Wait for the container to be healthy
echo "Checking container health (this may take 1-2 minutes)..."
for i in {1..120}; do
    if docker exec safeprint-app curl -s http://localhost:80/ > /dev/null 2>&1; then
        echo ""
        echo "╔══════════════════════════════════════════════════════════════╗"
        echo "║            ✓ SafePrint is now running!                       ║"
        echo "╠══════════════════════════════════════════════════════════════╣"
        echo "║  Access the application at:                                   ║"
        echo "║    🌐 http://localhost                                        ║"
        echo "║    🔧 Django Admin: http://localhost/django-admin/            ║"
        echo "║                                                               ║"
        echo "║  Useful commands:                                             ║"
        echo "║    View logs:     docker logs -f safeprint-app                ║"
        echo "║    Shell access:  docker exec -it safeprint-app bash          ║"
        echo "║    Stop:          docker stop safeprint-app                   ║"
        echo "║    Restart:       docker restart safeprint-app                ║"
        echo "╚══════════════════════════════════════════════════════════════╝"
        exit 0
    fi
    echo -n "."
    sleep 2
done

echo ""
echo "⚠ Container is taking longer than expected to start."
echo "Check the logs with: docker logs safeprint-app"
