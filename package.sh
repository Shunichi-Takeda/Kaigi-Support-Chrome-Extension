#!/bin/bash

# Kaigi-Support-Chrome-Extension packaging script
# Usage: ./package.sh v1.0.1

VERSION=$1
if [ -z "$VERSION" ]; then
    echo "Usage: ./package.sh <version_name>"
    exit 1
fi

OUTPUT_DIR="dist"
PACKAGE_NAME="kaigi-support-extension-$VERSION"

mkdir -p $OUTPUT_DIR

# 必要最小限のファイルのみをコピーしてzip化
zip -r "$OUTPUT_DIR/$PACKAGE_NAME.zip" manifest.json content.js styles.css README.md -x "*.git*" "verification/*" ".DS_Store"

echo "Package created: $OUTPUT_DIR/$PACKAGE_NAME.zip"
echo "You can upload this zip to GitHub Releases."
