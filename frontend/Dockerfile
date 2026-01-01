# Build stage
FROM node:24-alpine AS builder

ARG COMMIT_HASH=unknown

WORKDIR /app

# Copy root package files for workspaces
COPY package.json package-lock.json ./

# Copy frontend package.json
COPY frontend/package.json ./frontend/

# Install dependencies
RUN npm ci -w @soeji/frontend

# Copy frontend source files
COPY frontend/ ./frontend/

# Build the application
RUN npm run build -w @soeji/frontend

# Generate version.json
RUN echo "{\"commit\":\"${COMMIT_HASH}\",\"buildTime\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /app/frontend/dist/version.json

# Production stage
FROM nginx:1.28-alpine

# Copy nginx configuration
COPY frontend/nginx.conf /etc/nginx/nginx.conf

# Copy built files from builder stage
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
