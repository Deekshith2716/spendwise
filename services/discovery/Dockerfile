FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
EXPOSE 8761 4000 4001 4002 4003 4004
CMD ["node","server.js"]
