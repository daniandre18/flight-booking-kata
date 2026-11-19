# syntax=docker/dockerfile:1
# Imagen de la web: build de Angular servido por nginx, que hace de proxy hacia la api.

FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@10.34.9
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter "frontend..."
COPY shared shared
COPY frontend frontend
RUN pnpm --filter @kata/shared build && pnpm --filter frontend build

FROM nginx:1.28-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
