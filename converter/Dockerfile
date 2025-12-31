# Build stage
FROM rust:1.92-alpine AS builder

RUN apk add --no-cache musl-dev pkgconfig openssl-dev openssl-libs-static

WORKDIR /app

# Copy manifests and source
COPY converter/Cargo.toml ./
COPY converter/src ./src

# Build for release
RUN cargo build --release

# Runtime stage
FROM alpine:3.21

RUN apk add --no-cache ca-certificates curl

COPY --from=builder /app/target/release/soeji-converter /usr/local/bin/

EXPOSE 8000

CMD ["soeji-converter"]
