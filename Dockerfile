FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "src/server.js"]
