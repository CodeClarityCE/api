# syntax=docker/dockerfile:1

ARG USERNAME=codeclarity
ARG PNPM_VERSION=11.2.2

# Dev image
FROM node:26.2.0-alpine AS api-dev
WORKDIR /app
RUN npm install -g corepack@latest --force && corepack enable
RUN corepack prepare pnpm@${PNPM_VERSION} --activate
# Standalone install in /app. /app/pnpm-workspace.yaml (bind-mounted from
# api/pnpm-workspace.yaml on host) provides allowBuilds + minimumReleaseAge=0
# so this container does not need the repo-root workspace yaml.
ENTRYPOINT ["/bin/sh", "-c" , "pnpm install && pnpm run start:debug"]

# Build image
FROM node:26.2.0-alpine AS api-build
WORKDIR /app
RUN npm install -g corepack@latest --force && corepack enable
RUN corepack prepare pnpm@${PNPM_VERSION} --activate
ENV PNPM_STORE_DIR=/pnpm/store
COPY . .
RUN --mount=type=cache,id=pnpm-store-api,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile
RUN pnpm --filter api build
RUN --mount=type=cache,id=pnpm-store-api,target=/pnpm/store,sharing=locked \
    pnpm --filter api deploy --prod --legacy /out

# Prod image
FROM node:26.2.0-alpine AS api
ARG USERNAME
RUN adduser -D ${USERNAME}
USER ${USERNAME}
RUN mkdir /home/${USERNAME}/private
WORKDIR /home/${USERNAME}/app
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /out/dist ./dist
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /out/node_modules ./node_modules
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /out/package.json ./package.json
# Run migrations then start the API (ENV must be set e.g. via .env.api -> ENV=prod)
CMD ["/bin/sh", "-c", "node dist/scripts/run-migrations.js && node dist/main"]
