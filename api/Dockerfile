FROM node:22-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY dist ./dist

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/dist ./dist
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
