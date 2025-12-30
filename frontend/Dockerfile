# Build stage
FROM node:24-alpine AS builder

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

# Production stage
FROM nginx:1.28-alpine

# Copy nginx configuration
COPY frontend/nginx.conf /etc/nginx/nginx.conf

# Copy built files from builder stage
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
