# syntax=docker/dockerfile:1.7
FROM node:24-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production ENVIRONMENT=production
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json docker/start.sh ./
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh && mkdir -p media && chown -R node:node media

USER node
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["./start.sh"]
