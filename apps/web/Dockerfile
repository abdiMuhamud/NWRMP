# NWRMP web app — static build served by nginx, which also terminates HTTPS and
# forwards /api to the API container. Build from the repository root:
#   docker build -f apps/web/Dockerfile -t nwrmp-web .

# ---- Build the static app
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
# Optional: a self-hosted basemap style (defaults to OpenFreeMap)
ARG VITE_MAP_STYLE_URL=
ENV VITE_MAP_STYLE_URL=${VITE_MAP_STYLE_URL}
RUN npm run build

# ---- Serve with nginx
FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
# Site templates answer on any address (IP now, a domain name later). The nginx entrypoint renders
# the folder named by NGINX_ENVSUBST_TEMPLATE_DIR: templates/https (default) or templates/http.
COPY deploy/nginx/templates/ /etc/nginx/templates/
COPY deploy/nginx/snippets/ /etc/nginx/snippets/
COPY --from=build /app/dist /usr/share/nginx/html
ENV NGINX_ENVSUBST_TEMPLATE_DIR=/etc/nginx/templates/https \
    NWRMP_HTTPS_PORT=443
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
