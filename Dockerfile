FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=base /app/dist ./dist
COPY drizzle.config.ts ./
COPY src/db/migrations ./src/db/migrations
COPY src/views ./src/views
COPY src/public ./src/public
EXPOSE 3000
CMD ["node", "dist/index.js"]
