#!/usr/bin/env bash
set -euo pipefail

APP_NAME="vitalsight-api"
REGION="ord"

# Check fly CLI is installed
if ! command -v fly &> /dev/null; then
  echo "❌ fly CLI not found. Install it: https://fly.io/docs/flyctl/install/"
  exit 1
fi

# Check fly auth
if ! fly auth whoami &> /dev/null; then
  echo "❌ Not logged in to Fly.io. Run: fly auth login"
  exit 1
fi

echo "✅ Authenticated as $(fly auth whoami)"

# Check if app exists, create if not
if fly apps list --json | grep -q "\"$APP_NAME\""; then
  echo "✅ App '$APP_NAME' exists"
else
  echo "📦 Creating app '$APP_NAME' in region '$REGION'..."
  fly apps create "$APP_NAME" --org personal
  echo "✅ App '$APP_NAME' created"
fi

# Deploy (this creates machines automatically if none exist)
echo "🚀 Deploying to Fly.io..."
fly deploy

echo "✅ Deploy complete! App running at https://$APP_NAME.fly.dev"
