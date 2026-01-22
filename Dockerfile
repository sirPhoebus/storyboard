# --- Stage 1: Build the Client ---
FROM node:20-bookworm AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# --- Stage 2: Final Production Image ---
# Using the full image for both build and run to ensure native module compatibility
FROM node:20-bookworm
WORKDIR /app

# Install build tools for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Setup Server
WORKDIR /app/server
COPY server/package*.json ./
# Install ALL dependencies first so we can run tsc
RUN npm install

# Copy server source
COPY server/ ./

# Compile TypeScript to JavaScript
RUN npm run build

# Copy built client from Stage 1
COPY --from=client-builder /app/client/dist /app/client/dist

# Setup persistent data directory
ENV DATA_DIR=/app/data
ENV NODE_ENV=production
RUN mkdir -p /app/data

# Final cleanup: we could remove devDeps here but better-sqlite3 is already compiled
# and we need to be careful not to break the native link.
# For now, we'll keep it simple to ensure it works.

EXPOSE 5000

# Run using standard node from the compiled dist folder
CMD ["node", "dist/index.js"]
