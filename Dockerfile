# syntax=docker/dockerfile:1

# ---- Build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- Runtime ----
FROM node:24-alpine
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000 \
    HOST=0.0.0.0 \
    BODY_SIZE_LIMIT=50M \
    TZ=Europe/Zurich
RUN apk add --no-cache tzdata \
    && mkdir -p /data && chown node:node /data
WORKDIR /app
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json /app/server.js ./
# Konverter-Skript (Backup → Markdown/JSON/PDF): läuft direkt als TypeScript und braucht dafür die Quellen aus src/lib
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src/lib ./src/lib
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s \
    CMD wget -q --spider http://127.0.0.1:3000/login || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
