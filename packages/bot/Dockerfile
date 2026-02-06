FROM node:22-slim AS base
RUN npm install -g pnpm

FROM base AS build
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/bot/package.json packages/bot/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json tsconfig.json ./
COPY packages/db/ packages/db/
COPY packages/core/ packages/core/
COPY packages/bot/ packages/bot/
RUN pnpm run build

FROM base AS production
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/bot/package.json packages/bot/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/bot/dist packages/bot/dist
COPY packages/db/migrations packages/db/migrations

CMD ["node", "packages/bot/dist/index.js"]
