FROM node:20-alpine AS base

WORKDIR /app
RUN npm install -g pnpm

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# Build the app
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
COPY .env.example .env

# NEXT_PUBLIC_* is inlined at build time. Pass your public workout origin (e.g. https://workouts.peptideos.us)
# via `docker compose build --build-arg NEXT_PUBLIC_APP_URL=...` or compose `build.args` so clients don’t embed localhost.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ARG BETTER_AUTH_URL=http://localhost:3000
ENV BETTER_AUTH_URL=${BETTER_AUTH_URL}

# Build does not require your real prod secrets in the image layers; compose injects `.env` at runtime.
RUN SKIP_ENV_VALIDATION=1 pnpm run build

# Production image, copy only necessary files
FROM base AS runner
WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/data ./data

COPY scripts /app/scripts
# Windows checkouts often use CRLF; strip \r so `sh` and Prisma CLI don't see bogus commands (e.g. "generate\r").
RUN sed -i 's/\r$//' /app/scripts/setup.sh && chmod +x /app/scripts/setup.sh

# Use `/bin/sh` explicitly so a broken shebang line does not prevent startup.
ENTRYPOINT ["/bin/sh", "/app/scripts/setup.sh"]

EXPOSE 3000
ENV PORT=3000

CMD ["pnpm", "start"]