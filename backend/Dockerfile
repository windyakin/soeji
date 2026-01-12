# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy root package files for workspaces
COPY package.json package-lock.json ./

# Copy backend package.json
COPY backend/package.json ./backend/

# Copy prisma schema
COPY backend/prisma ./backend/prisma

# Install dependencies
RUN npm ci -w @soeji/backend

# Generate Prisma client
RUN npm run db:generate -w @soeji/backend

# Copy backend source files
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/

# Build the application
RUN npm run build -w @soeji/backend

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy root package files for workspaces
COPY package.json package-lock.json ./

# Copy backend package.json
COPY backend/package.json ./backend/

# Copy prisma schema
COPY backend/prisma ./backend/prisma

# Install production dependencies only
RUN npm ci -w @soeji/backend --omit=dev

# Generate Prisma client
RUN npm run db:generate -w @soeji/backend

# Copy built files
COPY --from=builder /app/backend/dist ./backend/dist

WORKDIR /app/backend

EXPOSE 3000

CMD ["node", "dist/index.js"]
