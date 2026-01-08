#!/bin/bash
# Generate icon font from SVG files in assets/icons/
# Usage: ./scripts/generate-icon-font.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Generating icon font from SVG files..."

cd "$PROJECT_DIR"

# Run fantasticon to generate the font
# Input directory is positional argument
# Use config file for more control
npx fantasticon -c .fantasticonrc.json

echo ""
echo "Icon font generated successfully!"
echo "  - assets/flox-icons.woff"
echo "  - assets/flox-icons.json (codepoints reference)"
echo ""
echo "Update package.json icons contribution with the codepoint from flox-icons.json"
