FROM node:22.12.0-alpine AS build

WORKDIR /workspace
RUN npm install --global pnpm@9.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/tsconfig.base.json packages/config/tsconfig.base.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
RUN pnpm --filter @daygym/api build

FROM node:22.12.0-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /workspace
RUN npm install --global pnpm@9.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /workspace/apps/api/dist apps/api/dist

USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
