FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/

RUN npm ci --workspace=apps/api --workspace=packages/types --include-workspace-root

COPY packages/types ./packages/types
COPY apps/api ./apps/api

RUN npm run build -w packages/types
RUN npm run db:generate -w apps/api
RUN npm run build -w apps/api

FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/

RUN npm ci --workspace=apps/api --workspace=packages/types --include-workspace-root --omit=dev

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma
COPY apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
