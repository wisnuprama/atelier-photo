# syntax=docker/dockerfile:1

# ---------- build stage ----------
FROM node:24-slim AS build
WORKDIR /app

# Native modules (better-sqlite3, sharp) need a build toolchain + python.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Install deps first (better layer caching).
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build \
  && pnpm prune --prod

# ---------- runtime stage ----------
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data
WORKDIR /app

# Non-root runtime user.
RUN useradd --system --create-home --uid 10001 app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /app/data && chown -R app:app /app
USER app

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "dist/server/server.js"]
