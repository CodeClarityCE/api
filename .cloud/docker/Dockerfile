# syntax=docker/dockerfile:1

ARG USERNAME=codeclarity

# Toolchain image: pinned Node + corepack + the pnpm version from package.json's
# packageManager field (the single source of truth for pnpm). Jenkins runs its
# Setup/Test stages inside this target, so CI uses the same toolchain as the
# image build instead of whatever the agent host has installed. Corepack must be
# >= 0.34.5: pnpm >= 11 ships bin/pnpm.mjs and older corepack looks for pnpm.cjs.
FROM node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS toolchain
ENV COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
RUN npm install -g corepack@0.36.0 --force && corepack enable
COPY package.json ./
# World-writable so the unprivileged Jenkins uid can use the cached pnpm.
RUN corepack install && chmod -R a+rwX /opt/corepack

# Dev image
FROM toolchain AS api-dev
# Standalone install in /app. /app/pnpm-workspace.yaml (bind-mounted from
# api/.cloud/docker/pnpm-workspace.yaml on host) provides allowBuilds and the
# minimumReleaseAge gate so this container does not need the repo-root workspace yaml.
ENTRYPOINT ["/bin/sh", "-c" , "pnpm install && pnpm run start:debug"]

# Build image
FROM toolchain AS api-build
ENV PNPM_STORE_DIR=/pnpm/store
COPY . .
# Stage the standalone pnpm config at the build root (allowBuilds +
# minimumReleaseAge). Source of truth is .cloud/docker/pnpm-workspace.yaml;
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
FROM node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS api
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
