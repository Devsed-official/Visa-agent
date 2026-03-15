# syntax=docker/dockerfile:1

# Use the official UV Python base image with Python 3.13 on Debian Bookworm
ARG PYTHON_VERSION=3.13
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS base

# Keeps Python from buffering stdout and stderr
ENV PYTHONUNBUFFERED=1

# Create a non-privileged user
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

# Install build dependencies for Python packages with native extensions
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first for efficient layer caching
COPY pyproject.toml uv.lock* ./
RUN mkdir -p src

# Install Python dependencies using UV
# If uv.lock doesn't exist, it will be created
RUN uv sync --locked || uv sync

# Copy all remaining application files
COPY . .

# Change ownership to non-privileged user
RUN chown -R appuser:appuser /app

# Switch to non-privileged user
USER appuser

# Pre-download any ML models (VAD, etc.)
RUN uv run src/agent.py download-files || true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD pgrep -f "agent.py" || exit 1

# Run the agent
CMD ["uv", "run", "src/agent.py", "start"]
