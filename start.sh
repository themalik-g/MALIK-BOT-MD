#!/bin/sh
# Optimized startup script for 256MB VPS

export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=192 --optimize-for-size --gc-interval=100"

echo "🚀 Starting MALIK-BOT-MD (Optimized for 256MB RAM)..."
echo "   Node Options: $NODE_OPTIONS"
echo ""

# Ensure directories exist
mkdir -p session data temp assets logs

# Run cleanup first
node cleanup.js

# Start bot
exec node $NODE_OPTIONS index.js
