# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy root package files for workspaces
COPY package.json package-lock.json ./

# Copy service package.json
COPY service/package.json ./service/

# Copy prisma schema
COPY service/prisma ./service/prisma

# Install dependencies
RUN npm ci -w @soeji/service

# Generate Prisma client
RUN npm run db:generate -w @soeji/service

# Copy source files
COPY service/src ./service/src
COPY service/tsconfig.json ./service/

# Build the application
RUN npm run build -w @soeji/service

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy root package files for workspaces
COPY package.json package-lock.json ./

# Copy service package.json
COPY service/package.json ./service/

# Copy prisma schema
COPY service/prisma ./service/prisma

# Install production dependencies only
RUN npm ci -w @soeji/service --omit=dev

# Generate Prisma client
RUN npm run db:generate -w @soeji/service

# Copy built files
COPY --from=builder /app/service/dist ./service/dist

WORKDIR /app/service

CMD ["node", "dist/index.js"]
