# --- Stage 1: Build the Client ---
FROM node:20-slim AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# --- Stage 2: Build the Server ---
FROM node:20-slim AS server-builder
WORKDIR /app/server

# Install dependencies for native-sqlite (native modules)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build

# --- Stage 3: Final Production Image ---
FROM node:20-slim
WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy built server
COPY --from=server-builder /app/server/package*.json ./server/
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=server-builder /app/server/dist ./server/dist

# Copy built client
COPY --from=client-builder /app/client/dist ./client/dist

# Environment variables
ENV DATA_DIR=/app/data
ENV NODE_ENV=production
RUN mkdir -p /app/data

WORKDIR /app/server
EXPOSE 5000

# Run using standard node
CMD ["node", "dist/index.js"]
