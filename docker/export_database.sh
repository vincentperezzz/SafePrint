#!/bin/bash
# ========================================
# SafePrint Database Export Script
# Run this on the SOURCE SERVER to export the complete database
# ========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          SafePrint Database Export Script                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Create data directory
mkdir -p "$DATA_DIR"

# Database credentials (modify if different)
DB_NAME="${DB_NAME:-SAFEPRINT_DB}"
DB_USER="${DB_USER:-SAFEPRINT_ADMIN}"
DB_PASSWORD="${DB_PASSWORD:-@MYSQL_datugavinoperez1}"
DB_HOST="${DB_HOST:-localhost}"

echo "Exporting database: $DB_NAME"
echo "User: $DB_USER"
echo ""

# Export full database with data
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Exporting complete database with data..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mysqldump -u "$DB_USER" -p"$DB_PASSWORD" -h "$DB_HOST" \
    --single-transaction \
    --routines \
    --triggers \
    --add-drop-table \
    "$DB_NAME" > "$DATA_DIR/database_dump.sql"

echo "✓ Database exported to: $DATA_DIR/database_dump.sql"

# Create a backup with timestamp
cp "$DATA_DIR/database_dump.sql" "$DATA_DIR/database_dump_${TIMESTAMP}.sql"
echo "✓ Backup created: $DATA_DIR/database_dump_${TIMESTAMP}.sql"

# Export schema only (for reference)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Exporting database schema (no data)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mysqldump -u "$DB_USER" -p"$DB_PASSWORD" -h "$DB_HOST" \
    --no-data \
    --routines \
    --triggers \
    "$DB_NAME" > "$DATA_DIR/database_schema.sql"

echo "✓ Schema exported to: $DATA_DIR/database_schema.sql"

# Show file sizes
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Export Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ls -lh "$DATA_DIR"/*.sql

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║ ✓ Database export complete!                                   ║"
echo "║                                                               ║"
echo "║ Next steps:                                                   ║"
echo "║ 1. The docker/data directory now contains the database dump   ║"
echo "║ 2. Commit and push this to your repository                    ║"
echo "║ 3. On the target machine, run: ./docker/setup.sh              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
