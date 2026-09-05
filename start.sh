#!/bin/bash
# 𝙈𝘼𝙇𝙄𝙆 𝙈𝘿 Startup Script
# Owner: 𝙈𝘼𝙇𝙄𝙆 𝙈𝙀𝙃𝙏𝘼𝘽

echo "🚀 Starting 𝙈𝘼𝙇𝙄𝙆 𝙈𝘿..."

# Create logs directory
mkdir -p logs

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install --legacy-peer-deps
fi

# Start with PM2
if command -v pm2 &> /dev/null; then
    pm2 start ecosystem.config.js
    pm2 save
    echo "✅ 𝙈𝘼𝙇𝙄𝙆 𝙈𝘿 started with PM2"
    echo "📊 Monitor: pm2 logs malik-md"
else
    echo "⚠️ PM2 not found. Starting with node..."
    node --max-old-space-size=768 --optimize-for-size index.js
fi
