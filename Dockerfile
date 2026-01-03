FROM node:20-alpine AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
ARG PRISMA_SCHEMA=prisma/schema.prisma
RUN npx prisma generate --schema $PRISMA_SCHEMA

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
