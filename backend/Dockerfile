FROM rust:1.85-slim-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY backend/Cargo.toml ./backend/
RUN mkdir -p backend/src && touch backend/src/lib.rs
RUN cargo build --release --package privault-backend 2>/dev/null || true
COPY . .
RUN cargo build --release --package privault-backend

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/privault-backend .
RUN mkdir -p /app/uploads
EXPOSE 8080
CMD ["./privault-backend"]
