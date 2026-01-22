# Using a single-stage build to guarantee binary compatibility
FROM node:20-bookworm

# 1. Install system dependencies required for compiling native modules (like better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Copy the entire project
# (Ensure .dockerignore handles skipping local node_modules and big files)
COPY . .

# 3. Build the Client
WORKDIR /app/client
RUN npm install
RUN npm run build

# 4. Build the Server
WORKDIR /app/server
RUN npm install
# FORCE a rebuild of native modules to match the current Linux environment
RUN npm rebuild better-sqlite3 --build-from-source
RUN npx tsc -p tsconfig.json

# 5. Production setup
ENV DATA_DIR=/app/data
ENV NODE_ENV=production
RUN mkdir -p /app/data

EXPOSE 5000

# Start the server
CMD ["node", "dist/index.js"]
