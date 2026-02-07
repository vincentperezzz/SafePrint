#!/bin/bash
# ========================================
# SafePrint - Create New Branch for Collaboration
# Creates the Admin-Vendo-Redesign branch for the other developer
# ========================================

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     Creating Admin-Vendo-Redesign Branch for Collaboration   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Make sure we're on the Vendo branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "Vendo" ]; then
    echo "⚠ You are currently on branch: $CURRENT_BRANCH"
    echo "  Switching to Vendo branch..."
    git checkout Vendo
fi

# Make sure we have the latest changes
echo "Pulling latest changes from Vendo..."
git pull origin Vendo

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo ""
    echo "You have uncommitted changes. Committing them first..."
    git add .
    git commit -m "Add Docker development environment for collaboration"
fi

# Create the new branch
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Creating Admin-Vendo-Redesign branch..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if git show-ref --verify --quiet refs/heads/Admin-Vendo-Redesign; then
    echo "Branch Admin-Vendo-Redesign already exists locally."
else
    git branch Admin-Vendo-Redesign
    echo "✓ Branch Admin-Vendo-Redesign created"
fi

# Push the new branch to remote
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Pushing branch to remote..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
git push -u origin Admin-Vendo-Redesign

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║ ✓ Branch created and pushed successfully!                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                               ║"
echo "║ Tell the other developer to run:                              ║"
echo "║                                                               ║"
echo "║   git clone git@github.com:vincentperezzz/SafePrint.git      ║"
echo "║   cd SafePrint                                                ║"
echo "║   git checkout Admin-Vendo-Redesign                          ║"
echo "║   ./docker/setup.sh                                          ║"
echo "║                                                               ║"
echo "║ Branch Structure:                                             ║"
echo "║   Vendo              <- Your work (production ready)          ║"
echo "║   Admin-Vendo-Redesign <- Other developer's work             ║"
echo "║                                                               ║"
echo "║ Later, merge branches for stable builds.                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
