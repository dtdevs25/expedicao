# Build stage for React
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN apt-get update && apt-get install -y openssl
COPY . .
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY server.ts ./
COPY prisma ./prisma/
COPY tsconfig.json ./

RUN npm install -g tsx

# Only install what's actually needed: openssl for Prisma
RUN apt-get update && apt-get install -y openssl --no-install-recommends && rm -rf /var/lib/apt/lists/*

EXPOSE 3000

CMD npx prisma db push --accept-data-loss && tsx server.ts
