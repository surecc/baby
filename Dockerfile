FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# SQLite 数据持久化目录
RUN mkdir -p /data

ENV PORT=3000
ENV DB_PATH=/data/baby.db

EXPOSE 3000

CMD ["node", "server.js"]
