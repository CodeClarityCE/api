# syntax=docker/dockerfile:1

ARG USERNAME=codeclarity
ARG PNPM_VERSION=12.3.4

# Dev image
FROM node:26.8.1-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS api-dev
WORKDIR /app
RUN npm install -g corepack@latest --force && corepack enable
RUN corepack prepare pnpm@${PNPM_VERSION} --activate
# Standalone install in /app. /app/pnpm-workspace.yaml (bind-mounted from
# api/.cloud/docker/pnpm-workspace.yaml on host) provides allowBuilds +
# minimumReleaseAge=0 so this container does not need the repo-root workspace yaml.
ENTRYPOINT ["/bin/sh", "-c" , "pnpm install && pnpm run start:debug"]

# Build image
FROM node:26.8.1-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS api-build
WORKDIR /app
RUN npm install -g corepack@latest --force && corepack enable
RUN corepack prepare pnpm@${PNPM_VERSION} --activate
ENV PNPM_STORE_DIR=/pnpm/store
COPY . .
# Stage the standalone pnpm config at the build root (allowBuilds +
# minimumReleaseAge=0). Source of truth is .cloud/docker/pnpm-workspace.yaml;
# this COPY makes the Dockerfile self-sufficient regardless of whether Jenkins
# pre-staged the file or not.
COPY .cloud/docker/pnpm-workspace.yaml ./pnpm-workspace.yaml
# Full install (incl. devDeps for the build step).
RUN --mount=type=cache,id=pnpm-store-api,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile
# Run api's build script directly. No --filter: this stage is a STANDALONE
# clone of the api package, not a workspace, so --filter api wouldn't match
# anything and would silently no-op.
RUN pnpm run build
# Prune devDependencies post-build to slim node_modules for the prod image.
RUN pnpm prune --prod

# Prod image
FROM node:26.8.1-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS api
ARG USERNAME
RUN adduser -D ${USERNAME}
USER ${USERNAME}
RUN mkdir /home/${USERNAME}/private
WORKDIR /home/${USERNAME}/app
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /app/dist ./dist
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /app/node_modules ./node_modules
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /app/package.json ./package.json
# Run migrations then start the API (ENV must be set e.g. via .env.api -> ENV=prod)
CMD ["/bin/sh", "-c", "node dist/scripts/run-migrations.js && node dist/main"]
