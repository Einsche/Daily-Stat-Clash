FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/daily-stat-clash.sqlite
RUN mkdir -p /data
COPY package.json ./
COPY server ./server
COPY web ./web
COPY app/src/data/characters.json ./app/src/data/characters.json
COPY app/public/assets/portraits ./app/public/assets/portraits
EXPOSE 3000
VOLUME ["/data"]
CMD ["node","server/index.js"]
