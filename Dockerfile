# Build stage for React
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN apt-get update && apt-get install -y openssl
COPY . .
RUN npx prisma generate
RUN npm run build

# Production stage — use full node:20 image which already includes openssl
# This avoids apt-get GPG signature issues on the build server
FROM node:20
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

EXPOSE 3000

CMD npx prisma db push --accept-data-loss && tsx server.ts
