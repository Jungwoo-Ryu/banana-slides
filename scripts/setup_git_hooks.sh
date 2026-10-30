#!/bin/bash
# Settings Git Hooks

set -e

echo "================================="
echo "Settings Git Hooks"
echo "================================="
echo ""
echo "ℹ️  Attention.: README Autotranslation moved to GitHub Actions"
echo ""

# Check if it’s in the root directory
if [ ! -d ".git" ]; then
    echo "Error: Please run this script in the root directory"
    exit 1
fi

# Create.githooks Contents (if not available)）
if [ ! -d ".githooks" ]; then
    echo "Error: .githooks Directory does not exist"
    exit 1
fi

# Check if enabled hooks
if [ -f ".githooks/pre-commit.disabled" ]; then
    echo "Disabled pre-commit hook"
    echo ""
    echo "README Translator now by GitHub Actions Autoprocessing："
    echo "  - Autotranslator when pushed to main branch"
    echo "  - Do not block local submission"
    echo "  - Savings API Call"
    echo ""
    read -p "Whether to restart pre-commit hook？(Not recommended) [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        mv .githooks/pre-commit.disabled .githooks/pre-commit
        echo "✅ Pre-commit hook Enabled"
    else
        echo "✅ Hold GitHub Actions Programme (recommended)）"
        echo ""
        echo "Manual Translation Commands: uv run python scripts/translate_readme.py"
        exit 0
    fi
fi

# Configuration Git Use custom hooks Contents
if [ -f ".githooks/pre-commit" ]; then
    echo "Configuration Git Usage.githooks Contents..."
    git config core.hooksPath .githooks

    # Ensure hooks There are enforcement powers.
    echo "Settings hooks Enforcement authority..."
    chmod +x .githooks/pre-commit

    echo ""
    echo "================================="
    echo "✅ Git Hooks Settings completed！"
    echo "================================="
    echo ""
    echo "Enabled："
    echo "  • pre-commit: when README.md Autotranslation on change to README_EN.md"
    echo ""
    echo "Hint："
    echo "  - Modify README.md When submitted, translate automatically README_EN.md"
    echo "  - Yes, I do..env Medium Configuration GOOGLE_API_KEY"
    echo "  - If the translation fails, it won’t stop the submission."
    echo "  - Each submission may require waiting 30-60 sec"
else
    echo ""
    echo "================================="
    echo "✅ No Settings Git Hooks"
    echo "================================="
    echo ""
    echo "README Translation by GitHub Actions Autoprocessing"
    echo "View Details: .githooks/README.md"
fi

echo ""

