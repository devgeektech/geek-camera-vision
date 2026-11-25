FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .
ENV API_INTERNAL_URL=http://api:4010
ENV NEXT_PUBLIC_SOCKET_URL=http://127.0.0.1:4010
ENV WEB_PORT=3010
RUN pnpm --filter @visionops/web build
EXPOSE 3010
CMD ["pnpm", "--filter", "@visionops/web", "start"]
