# ── Stage 1: build frontend SPA ──────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/
RUN npm ci --workspace=packages/shared --workspace=packages/frontend

COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
RUN npm run build -w packages/shared
RUN npm run build -w packages/frontend

# ── Stage 2: build backend ────────────────────────────────────────────────────
FROM node:20-alpine AS backend-builder

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN npm ci --workspace=packages/shared --workspace=packages/backend

COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
RUN npm run build -w packages/shared
RUN npm run build -w packages/backend

# ── Stage 3: production image ─────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy built backend
COPY --from=backend-builder /app/packages/backend/dist ./dist
COPY --from=backend-builder /app/packages/backend/src/db/migrations ./dist/db/migrations

# Copy production dependencies only
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN npm ci --workspace=packages/shared --workspace=packages/backend --omit=dev

# Copy compiled frontend SPA for Fastify to serve as static files
COPY --from=frontend-builder /app/packages/frontend/build ./public

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
