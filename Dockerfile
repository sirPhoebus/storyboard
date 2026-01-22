# --- Stage 1: Build the Client ---
FROM node:20-slim AS client-builder
WORKDIR /app/client

# Copy only package files first for better caching
COPY client/package*.json ./
RUN npm install

# Copy source and build
COPY client/ ./
RUN npm run build

# --- Stage 2: Build the Server ---
FROM node:20-slim
WORKDIR /app

# Install dependencies for better-sqlite3 (native modules)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Setup Server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install

# Copy server source
COPY server/ ./

# Setup Client distribution
WORKDIR /app/client
COPY --from=client-builder /app/client/dist ./dist

# Create data directory for persistence
WORKDIR /app
RUN mkdir -p /app/data
ENV DATA_DIR=/app/data
ENV NODE_ENV=production

# Final environment
WORKDIR /app/server
EXPOSE 5000

# Start using ts-node or compile and run (ts-node is easier for this scale)
CMD ["npx", "ts-node", "index.ts"]
