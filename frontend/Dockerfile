# syntax=docker/dockerfile:1
FROM node:22.23.4-bookworm-slim AS frontend-builder
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
COPY scripts/check-node.cjs /src/scripts/check-node.cjs
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci
COPY frontend/ ./
RUN npm run build:web
FROM nginx:stable-alpine
COPY --from=frontend-builder /src/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
