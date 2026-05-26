FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_API_URL=http://localhost:3001

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/

RUN npm ci --workspace=apps/web --workspace=packages/types --include-workspace-root

COPY packages/types ./packages/types
COPY apps/web ./apps/web

RUN npm run build -w packages/types
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w apps/web

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
