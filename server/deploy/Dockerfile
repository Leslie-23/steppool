# Build context is the folder holding server/ and shared/ (the server bundles shared/contracts).
FROM node:22-alpine AS build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY server/ ./
COPY shared/ ../shared/
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "--enable-source-maps", "dist/index.js"]
