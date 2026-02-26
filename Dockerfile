# Use official Node.js 20 runtime as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and build script
COPY package*.json ./
COPY build.mjs ./

# Install all dependencies (need esbuild for build step)
RUN npm ci

# Copy source code
COPY src ./src

# Build with esbuild (fast, no OOM issues)
RUN npm run build

# Remove dev dependencies and source files
RUN npm prune --production && \
    rm -rf src build.mjs tsconfig.json

# Expose port (Cloud Run will inject PORT env var)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run the server
CMD ["node", "dist/index.js"]
