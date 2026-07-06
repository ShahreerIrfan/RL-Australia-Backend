FROM node:20-alpine AS base

# Install build dependencies
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Enable Corepack for Yarn Berry if yarn.lock is used
RUN corepack enable

# Copy dependencies definitions and hoisting configuration
COPY package.json yarn.lock* package-lock.json* .npmrc* .yarnrc.yml* ./
COPY .yarn ./.yarn

# Install dependencies
RUN \
  if [ -f yarn.lock ]; then yarn install; \
  elif [ -f package-lock.json ]; then npm ci; \
  else npm install; \
  fi

# Copy all source files
COPY . .

# Build typescript codebase and admin dashboard
ENV MEDUSA_ADMIN_BUILD=true
RUN npm run build

# Production runner stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy necessary files for running Medusa
COPY --from=base /app/.medusa /app/.medusa
COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /app/package.json /app/package.json
COPY --from=base /app/medusa-config.ts /app/medusa-config.ts
COPY --from=base /app/instrumentation.ts /app/instrumentation.ts
COPY --from=base /app/tsconfig.json /app/tsconfig.json
COPY --from=base /app/src /app/src

EXPOSE 9000

# Run migrations and start the server
CMD ["sh", "-c", "npx medusa db:migrate && npm run start"]
