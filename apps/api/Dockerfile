# NWRMP API — production image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t nwrmp-api .

# ---- Build: install all dependencies and compile TypeScript
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json ./
COPY apps/api/src ./src
RUN npm run build

# ---- Runtime: production dependencies, compiled code and the sample workbook only
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    UPLOAD_DIR=/var/lib/nwrmp/uploads
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY apps/api/data ./data
RUN mkdir -p /var/lib/nwrmp/uploads && chown -R node:node /var/lib/nwrmp /app
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
