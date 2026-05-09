FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime
RUN apk add --no-cache dumb-init wget && \
    addgroup -S app && adduser -S app -G app

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=app:app . .

RUN mkdir -p /app/logs && chown -R app:app /app/logs

USER app
ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/healthz || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
