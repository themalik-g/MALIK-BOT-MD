FROM node:18-alpine

# Install only essential system packages
RUN apk add --no-cache \
    ffmpeg \
    libwebp-tools \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files first for better caching
COPY package.json ./
RUN npm install --legacy-peer-deps --no-optional --production && \
    npm cache clean --force

# Copy app files
COPY . .

# Create necessary directories
RUN mkdir -p session data temp assets logs

# Environment optimizations
ENV NODE_ENV=production
ENV TMPDIR=/app/temp
ENV TEMP=/app/temp
ENV TMP=/app/temp

EXPOSE 5000

CMD ["node", "--max-old-space-size=192", "--optimize-for-size", "--gc-interval=100", "index.js"]
