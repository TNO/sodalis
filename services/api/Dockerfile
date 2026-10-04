FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install -g pnpm@12.4.1
COPY . .
RUN pnpm install --frozen-lockfile
ENV HOST=0.0.0.0
