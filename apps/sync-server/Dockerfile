FROM node:22-alpine AS build
WORKDIR /app

COPY . .

RUN npm ci

RUN npm run -w packages/shared build && npm run -w apps/sync-server build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/sync-server/dist ./apps/sync-server/dist
COPY --from=build /app/apps/sync-server/package.json ./apps/sync-server/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json

EXPOSE 4000

CMD ["node", "apps/sync-server/dist/index.js"]
