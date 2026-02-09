FROM node:22-slim AS base
RUN npm install -g pnpm

FROM base AS build
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/bot/package.json packages/bot/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json tsconfig.json ./
COPY packages/db/ packages/db/
COPY packages/core/ packages/core/
COPY packages/bot/ packages/bot/
COPY packages/api/ packages/api/
COPY packages/web/ packages/web/
RUN pnpm run build
RUN cd packages/web && npx vite build

FROM base AS production
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/bot/package.json packages/bot/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/bot/dist packages/bot/dist
COPY --from=build /app/packages/api/dist packages/api/dist
COPY --from=build /app/packages/web/dist packages/web/dist
COPY packages/db/migrations packages/db/migrations

CMD ["node", "packages/bot/dist/index.js"]
