FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p ./data/cache
COPY --from=builder --chown=nextjs:nodejs /app/data/cache/cards.compact.json ./data/cache/cards.compact.json
COPY --from=builder --chown=nextjs:nodejs /app/data/cache/cards.meta.json ./data/cache/cards.meta.json
COPY --from=builder --chown=nextjs:nodejs /app/data/cache/image-index.json ./data/cache/image-index.json
RUN mkdir -p ./data && chown -R nextjs:nodejs ./data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
