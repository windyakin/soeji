# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy root package files for workspaces
COPY package.json package-lock.json ./

# Copy watcher package.json
COPY watcher/package.json ./watcher/

# Install dependencies
RUN npm ci -w @soeji/watcher

# Copy source files
COPY watcher/src ./watcher/src
COPY watcher/tsconfig.json ./watcher/

# Build the application
RUN npm run build -w @soeji/watcher

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy root package files for workspaces
COPY package.json package-lock.json ./

# Copy watcher package.json
COPY watcher/package.json ./watcher/

# Install production dependencies only
RUN npm ci -w @soeji/watcher --omit=dev

# Copy built files
COPY --from=builder /app/watcher/dist ./watcher/dist

WORKDIR /app/watcher

CMD ["node", "dist/index.js"]
