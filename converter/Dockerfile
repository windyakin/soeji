# Build stage
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache gcc musl-dev libwebp-dev libwebp-static

WORKDIR /app

# Copy go mod files
COPY converter/go.mod converter/go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY converter/*.go ./

# Build static binary with CGO
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-w -s -linkmode external -extldflags '-static'" -o soeji-converter .

# Runtime stage - scratch for minimal size
FROM scratch

# Copy CA certificates for HTTPS
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

COPY --from=builder /app/soeji-converter /soeji-converter

EXPOSE 8000

ENTRYPOINT ["/soeji-converter"]
