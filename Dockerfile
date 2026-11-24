FROM node:24-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@10.34.9
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV NODE_ENV=production PORT=5173 BASE_PATH=/
RUN pnpm --filter @workspace/beautyhub build && pnpm --filter @workspace/api-server build

FROM build AS database-tools
ENV NODE_ENV=development
CMD ["pnpm", "--filter", "@workspace/db", "run", "migrate:dev"]

FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /workspace/artifacts/api-server/dist ./dist
RUN mkdir /app/booking-email && chown node:node /app/booking-email
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

FROM nginx:stable-bookworm AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/artifacts/beautyhub/dist/public /usr/share/nginx/html
