# Build stage
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git gcc musl-dev

WORKDIR /app

# Copy go mod files
COPY converter/go.mod converter/go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY converter/*.go ./

# Build for release
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -ldflags="-w -s" -o soeji-converter .

# Runtime stage
FROM alpine:3.21

RUN apk add --no-cache ca-certificates curl

COPY --from=builder /app/soeji-converter /usr/local/bin/

EXPOSE 8000

CMD ["soeji-converter"]
