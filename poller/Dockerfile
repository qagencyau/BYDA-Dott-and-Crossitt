FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY service.js ./

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8081) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
