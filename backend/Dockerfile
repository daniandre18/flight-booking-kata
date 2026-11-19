# syntax=docker/dockerfile:1
# Imagen de la api. El contexto de build es la raíz del monorepo (necesita @kata/shared).

FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@10.34.9
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter "backend..."
COPY shared shared
COPY backend backend
RUN pnpm --filter @kata/shared build && pnpm --filter backend build

# Se conservan las dependencias de desarrollo: el entrypoint usa la CLI de Prisma y tsx (seed).
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/backend
RUN chmod +x docker/entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker/entrypoint.sh"]
