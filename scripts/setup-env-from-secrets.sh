#!/bin/bash
# Generic environment variable replacement script
# Automatically replaces configuration items in .env file from GitHub Secrets or environment variables
#
# Usage:
#   ./scripts/setup-env-from-secrets.sh

set -e

ENV_FILE="${1:-.env}"
ENV_EXAMPLE="${2:-.env.example}"

echo "Setting up environment variables..."
echo "   Source file: $ENV_EXAMPLE"
echo "   Target file: $ENV_FILE"
echo ""

# Copy .env.example to .env
cp "$ENV_EXAMPLE" "$ENV_FILE"

# Define list of configuration items to be replaced from environment variables/Secrets
# Format: configuration item name
REPLACEABLE_VARS=(
  "BACKEND_PORT"
  "FRONTEND_PORT"
  "OUTPUT_LANGUAGE"
  "LOG_LEVEL"
  "AZURE_OPENAI_ENDPOINT"
  "AZURE_OPENAI_API_KEY"
  "AZURE_OPENAI_API_VERSION"
  "AZURE_OPENAI_DEPLOYMENT"
  "AZURE_OPENAI_IMAGE_DEPLOYMENT"
  "AZURE_OPENAI_CAPTION_DEPLOYMENT"
  "AZURE_OPENAI_TIMEOUT"
  "AZURE_OPENAI_MAX_RETRIES"
  "AZURE_OPENAI_TTS_DEPLOYMENT"
  "AZURE_OPENAI_TTS_VOICE"
  "AZURE_OPENAI_TTS_INSTRUCTIONS"
  "FFMPEG_PATH"
  "VIDEO_MAX_PAGES"
  "IMAGE_QUALITY"
  "TEXT_MAX_OUTPUT_TOKENS"
  "MAX_DESCRIPTION_WORKERS"
  "MAX_IMAGE_WORKERS"
  "DESIGN_SYSTEM_PROMPT"
  "DOCUMENT_PARSER"
  "AUTO_IMAGE_CAPTION"
  "OCR_PROVIDER"
  "OCR_LANGUAGES"
  "TESSERACT_CMD"
  "INPAINTING_PROVIDER"
  "TEXT_STYLE_PROVIDER"
  "NO_PROXY"
)

replaced_count=0
skipped_count=0

# Iterate through each configuration item
for var_name in "${REPLACEABLE_VARS[@]}"; do
  # Get the value of the environment variable (if exists)
  var_value="${!var_name}"
  
    # If environment variable exists and is not empty, replace it
  if [ -n "$var_value" ]; then
    # Check if this configuration item exists in .env file
    if grep -q "^${var_name}=" "$ENV_FILE"; then
      # Escape special characters for sed replacement string (RHS)
      escaped_value=$(printf '%s\n' "$var_value" | sed -e 's/[\/&]/\\&/g')
      # Use sed to replace the entire line (handles special characters)
      # Use | as delimiter to support values with / like URLs
      sed -i "s|^${var_name}=.*|${var_name}=${escaped_value}|" "$ENV_FILE"
      echo "Replaced ${var_name}"
      replaced_count=$((replaced_count + 1))
    else
      echo "Warning: ${var_name} does not exist in .env file, skipping"
    fi
  else
    # Environment variable does not exist, keep default value
    skipped_count=$((skipped_count + 1))
  fi
done

echo ""
echo "Configuration complete:"
echo "   Replaced: $replaced_count items"
echo "   Using defaults: $skipped_count items"
echo ""

