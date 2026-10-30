# Mirror Source Configuration Parameters (by build args Overwrite）
ARG DOCKER_REGISTRY=
ARG GHCR_REGISTRY=ghcr.io/
ARG APT_MIRROR=
ARG PYPI_INDEX_URL=
ARG APP_VERSION_TAG=
ARG APP_COMMIT_SHA=
ARG APP_COMMIT_SHORT_SHA=
ARG APP_BUILD_DATE=

# Install uv（Use intermediate stage avoided COPY --from Question of extending the variable）
FROM ${GHCR_REGISTRY}astral-sh/uv:latest AS uv

# Usage Python 3.10 As a basic mirror,
# If it’s specified, DOCKER_REGISTRY，Use mirror source; otherwise use official source
FROM ${DOCKER_REGISTRY:-}python:3.10-slim

# Restatement ARG（FROM After ARG Inactivated field. Restated.）
ARG APT_MIRROR=
ARG PYPI_INDEX_URL=
ARG APP_VERSION_TAG=
ARG APP_COMMIT_SHA=
ARG APP_COMMIT_SHORT_SHA=
ARG APP_BUILD_DATE=

# Set Task Directory
WORKDIR /app

# Installation system dependent (if configured) APT_MIRROR，Replace mirror source first）
RUN if [ -n "$APT_MIRROR" ]; then \
        if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
            sed -i "s@deb.debian.org@$APT_MIRROR@g" /etc/apt/sources.list.d/debian.sources; \
        else \
            echo "Warning: /etc/apt/sources.list.d/debian.sources not found, skipping mirror setup." >&2; \
        fi; \
    fi && \
    apt-get update && apt-get install -y \
    curl \
    ffmpeg \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# From uv Phase Copy Binary File
COPY --from=uv /uv /usr/local/bin/uv
RUN chmod +x /usr/local/bin/uv

# Copy Project Profile
COPY pyproject.toml ./
COPY uv.lock* ./

# Configuration PyPI Mirror Source (if specified)）
ENV UV_INDEX_URL=${PYPI_INDEX_URL}

# Configuration uv Network timeout
ENV UV_HTTP_TIMEOUT=300

# Install Python Dependency
# If there is one... uv.lock The file is used --frozen，Otherwise generate a new lock file
RUN if [ -f uv.lock ]; then \
        uv sync --frozen; \
    else \
        uv sync; \
    fi

# Copy Backend
COPY backend/ ./backend/

# Copy Test Resource
COPY assets/ ./assets/

# Create the necessary directory
RUN mkdir -p /app/backend/instance /app/uploads

ENV PYTHONPATH=/app
ENV FLASK_APP=backend/app.py
# Fixed listening in the container 5000；Host port by docker-compose It’s... BACKEND_PORT Control
ENV IN_DOCKER=1
ENV APP_VERSION_TAG=${APP_VERSION_TAG}
ENV APP_COMMIT_SHA=${APP_COMMIT_SHA}
ENV APP_COMMIT_SHORT_SHA=${APP_COMMIT_SHORT_SHA}
ENV APP_BUILD_DATE=${APP_BUILD_DATE}
ENV DOCKERHUB_REPOSITORY=banana-slides-backend

# Exposure Port
EXPOSE 5000

# Fixed internal use of containers 5000 Port
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD ["sh", "-c", "curl -f http://localhost:5000/health || exit 1"]

# Start application. Directly use a synchronised virtual environment at the build stage to avoid re-connection resolution dependent on pre-build mirror startup。
CMD ["sh", "-c", "cd /app/backend && /app/.venv/bin/alembic upgrade head && exec /app/.venv/bin/python app.py"]
