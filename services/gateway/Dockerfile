FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@12.16.1
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline && pnpm --filter @sodalis/desktop build

FROM caddy:2.11-alpine
COPY --from=build /app/dist/desktop /srv
