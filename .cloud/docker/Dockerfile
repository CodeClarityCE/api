# syntax=docker/dockerfile:1

ARG USERNAME=codeclarity

# Dev image
FROM node:25.0.0-alpine AS api-dev
RUN npm i -g @nestjs/cli
WORKDIR /app
RUN npm install -g corepack --force
RUN corepack enable
ENTRYPOINT ["/bin/sh", "-c" , "yarn set version stable && yarn install && yarn run start:debug"]
# CMD  /bin/sh -c "while sleep 1000; do :; done"

# Build image
FROM node:25.0.0-alpine AS api-build
WORKDIR /app
COPY . .
# RUN yarn set version stable
RUN yarn
RUN yarn build
# RUN apk --no-cache add --virtual builds-dependencies build-base python3 make && npm rebuild bcrypt --build-from-source

# Prod image
FROM node:25.0.0-alpine AS api
ARG USERNAME
RUN adduser -D ${USERNAME}
USER ${USERNAME}
RUN mkdir /home/${USERNAME}/private
WORKDIR /home/${USERNAME}/app
# Copy only necessary files
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /app/dist ./dist
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /app/package.json ./package.json
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /app/yarn.lock ./yarn.lock
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /app/.yarn ./.yarn
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /app/.yarnrc.yml ./.yarnrc.yml
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /app/.pnp* .
COPY --chown=${USERNAME}:${USERNAME} --from=api-build /app/cvss-parser-js ./cvss-parser-js
# COPY --chown=${USERNAME}:${USERNAME} --from=api-build /app .
# Run migrations then start the API (ENV must be set e.g. via .env.api -> ENV=prod)
CMD ["/bin/sh", "-c", "yarn node dist/src/scripts/run-migrations.js && yarn node dist/src/main"]
# CMD  /bin/sh -c "while sleep 1000; do :; done"