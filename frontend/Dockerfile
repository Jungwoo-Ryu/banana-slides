# Mirror Source Configuration Parameters (by build args Overwrite）
ARG DOCKER_REGISTRY=
ARG NPM_REGISTRY=
ARG APP_VERSION_TAG=
ARG APP_COMMIT_SHA=
ARG APP_COMMIT_SHORT_SHA=

# Build Phase
# If it’s specified, DOCKER_REGISTRY，Use mirror source; otherwise use official source
FROM ${DOCKER_REGISTRY:-}node:22.23.4-alpine AS builder

# Restatement ARG（FROM After ARG Inactivated field. Restated.）
ARG NPM_REGISTRY=
ARG APP_VERSION_TAG=
ARG APP_COMMIT_SHA=
ARG APP_COMMIT_SHORT_SHA=
ENV VITE_APP_VERSION_TAG=${APP_VERSION_TAG}
ENV VITE_APP_COMMIT_SHA=${APP_COMMIT_SHA}
ENV VITE_APP_COMMIT_SHORT_SHA=${APP_COMMIT_SHORT_SHA}

WORKDIR /app

# Copy package.json
COPY frontend/package.json ./

# Installation Dependence (if configured) NPM_REGISTRY，Set mirror source first）
COPY frontend/package-lock.json* ./
COPY frontend/.npmrc ./
COPY scripts/check-node.cjs /scripts/check-node.cjs
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    if [ -n "$NPM_REGISTRY" ]; then \
        npm config set registry "$NPM_REGISTRY"; \
    fi && \
    npm ci

# Copy front-end source
COPY frontend/ ./

# Build Application
# Web deployments must resolve entry assets from the origin on nested routes.
# Keep the default relative-base build for Electron's local file loading.
RUN npm run build:web

# Production stage
# If it’s specified, DOCKER_REGISTRY，Use mirror source; otherwise use official source
FROM ${DOCKER_REGISTRY:-}nginx:alpine

# Copy Build to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx Profile
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Exposure Port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
